package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"

	vosk "github.com/alphacep/vosk-api/go"
	"github.com/gorilla/websocket"
	ffmpeg "github.com/u2takey/ffmpeg-go"
)

// {'conf': 1.0, 'end': 6.66, 'start': 6.24, 'word': 'zero'}
type Word struct {
	Confidence float32 `json:"conf"`
	End        float32 `json:"end"`
	Start      float32 `json:"start"`
	Word       string  `json:"word"`
}

type FullResult struct {
	Text   string `json:"text"`
	Result []Word `json:"result"`
}

// {'partial': 'zero', 'partial_result': [{'conf': 1.0, 'end': 6.66, 'start': 6.24, 'word': 'zero'}]}
type PartialResult struct {
	Partial string `json:"partial"`
	Result  []Word `json:"partial_result"`
}

type Result interface {
	FullResult | PartialResult
}

type Fanout struct {
	conns map[string]*websocket.Conn

	mu sync.RWMutex
}

func NewFanout() *Fanout {
	return &Fanout{
		conns: map[string]*websocket.Conn{},
	}
}

func (f *Fanout) Track(conn *websocket.Conn) {
	f.mu.Lock()
	defer f.mu.Unlock()

	fmt.Printf("[Tracking]: %s\n", conn.RemoteAddr())
	f.conns[conn.RemoteAddr().String()] = conn
}

func (f *Fanout) Untrack(conn *websocket.Conn) {
	f.mu.Lock()
	defer f.mu.Unlock()

	fmt.Printf("[UNTRACKING]: %s\n", conn.RemoteAddr())
	delete(f.conns, conn.RemoteAddr().String())
}

func (f *Fanout) SendMsg(msg any) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	for _, conn := range f.conns {
		data, _ := json.Marshal(msg)
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			fmt.Println("ERROR: ", err)
			f.Untrack(conn)
		}
	}
}

func main() {
	var filename string
	flag.StringVar(&filename, "f", "", "file to transcribe")
	flag.Parse()

	model, err := vosk.NewModel("vosk-model-en-us-0.22")
	if err != nil {
		log.Fatal(err)
	}

	// we can check if word is in the vocabulary
	// fmt.Println(model.FindWord("air"))

	sampleRate := 16000.0
	rec, err := vosk.NewRecognizer(model, sampleRate)
	if err != nil {
		log.Fatal(err)
	}
	rec.SetWords(1)

	reader, writer := io.Pipe()

	go func() {
		if err := ffmpeg.Input(filename).
			Output("pipe:",
				ffmpeg.KwArgs{
					"ar": fmt.Sprintf("%d", int(sampleRate)), "ac": "1", "f": "s16le",
				}).
			WithOutput(writer).
			Run(); err != nil {
			log.Fatalln(err)
		}
		writer.Close()
	}()

	msgs := make(chan any, 100)

	go func() {
		buf := make([]byte, 4096)

		for {
			_, err := reader.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Fatal(err)
				}
				break
			}

			if rec.AcceptWaveform(buf) != 0 {
				var res FullResult
				_ = json.Unmarshal([]byte(rec.Result()), &res)

				msgs <- res
			} else {
				var res PartialResult
				_ = json.Unmarshal([]byte(rec.PartialResult()), &res)
				if res.Partial != "" {
					msgs <- res
				}
			}
		}

		// Unmarshal example for final result
		var jres map[string]interface{}
		json.Unmarshal([]byte(rec.FinalResult()), &jres)
		fmt.Println("Final")
		fmt.Println(jres["text"])
	}()

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	fanout := NewFanout()

	go func() {
		for msg := range msgs {
			fanout.SendMsg(msg)
			switch msg.(type) {
			case FullResult:
				// fmt.Println("------------------------------")
				// fmt.Println("Result:")
				// fmt.Println(msg)
				// fmt.Println("------------------------------")
			case PartialResult:
				// fmt.Println("Partial:")
				// fmt.Println(msg)
			default:
				fmt.Println("unsupported type of msg")
				fmt.Println(msg)
			}
		}
	}()

	http.HandleFunc("/echo", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil) // error ignored for sake of simplicity
		if err != nil {
			log.Println("Upgrade error: ", err)
			return
		}

		fmt.Printf("[CONNECTION]: %s\n", conn.RemoteAddr())

		fanout.Track(conn)
	})

	http.ListenAndServe(":8080", nil)
}
