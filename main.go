package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/xjerod/transcribe/pkg/subtitle"
)

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

	// "vosk-model-ru-0.42"
	titler, err := subtitle.NewTitler(filename, "vosk-model-ru-0.42")
	if err != nil {
		log.Fatalln(err)
	}
	defer titler.Stop()

	go titler.Start()

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	fanout := NewFanout()

	go func() {
		var lastPartial string
		for msg := range titler.Results() {
			switch msg.(type) {
			case *subtitle.FullResult:
				fanout.SendMsg(msg)
				// fmt.Println("------------------------------")
				// fmt.Println("Result:")
				// fmt.Println(msg)
				// fmt.Println("------------------------------")
			case *subtitle.PartialResult:
				if msg.RawText() != lastPartial {
					fanout.SendMsg(msg)
				}
				lastPartial = msg.RawText()
				// fmt.Println("Partial:")
				// fmt.Println(msg)
			default:
				fmt.Println("unsupported type of msg")
				fmt.Println(msg)
			}
		}
	}()

	http.HandleFunc("/subtitle", func(w http.ResponseWriter, r *http.Request) {
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
