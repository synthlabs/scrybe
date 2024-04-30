package subtitle

import (
	"encoding/json"
	"fmt"
	"io"
	"log"

	vosk "github.com/alphacep/vosk-api/go"
	ffmpeg "github.com/u2takey/ffmpeg-go"
)

const (
	DefaultSampleRate = 16000.0
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

func (fr *FullResult) RawText() string {
	return fr.Text
}

// {'partial': 'zero', 'partial_result': [{'conf': 1.0, 'end': 6.66, 'start': 6.24, 'word': 'zero'}]}
type PartialResult struct {
	Partial string `json:"partial"`
	Result  []Word `json:"partial_result"`
}

func (pr *PartialResult) RawText() string {
	return pr.Partial
}

type Result interface {
	RawText() string
}

type Titler struct {
	inputName  string
	modelName  string
	sampleRate float64
	model      *vosk.VoskModel
	recognizer *vosk.VoskRecognizer
	pipeReader *io.PipeReader
	pipeWriter *io.PipeWriter
	results    chan Result
}

func NewTitler(inputName, modelName string) (*Titler, error) {
	t := &Titler{
		inputName:  inputName,
		modelName:  modelName,
		sampleRate: DefaultSampleRate,
		results:    make(chan Result, 100),
	}

	var err error
	t.model, err = vosk.NewModel(t.modelName)
	if err != nil {
		return nil, err
	}

	t.recognizer, err = vosk.NewRecognizer(t.model, t.sampleRate)
	if err != nil {
		return nil, err
	}
	t.recognizer.SetWords(1)

	t.pipeReader, t.pipeWriter = io.Pipe()

	return t, nil
}

func (t *Titler) Stop() {
	if err := t.pipeWriter.Close(); err != nil {
		log.Println("Pipe writer close error: ", err)
	}

	if err := t.pipeReader.Close(); err != nil {
		log.Println("Pipe reader close error: ", err)
	}
}

func (t *Titler) Start() {
	go func() {
		if err := ffmpeg.Input(t.inputName).
			Output("pipe:",
				ffmpeg.KwArgs{
					"ar": fmt.Sprintf("%d", int(t.sampleRate)), "ac": "1", "f": "s16le",
				}).
			WithOutput(t.pipeWriter).
			Run(); err != nil {
			log.Fatalln(err)
		}
		t.pipeWriter.Close()
	}()

	buf := make([]byte, 4096)

	for {
		_, err := t.pipeReader.Read(buf)
		if err != nil {
			if err != io.EOF {
				log.Fatal(err)
			}
			break
		}

		if t.recognizer.AcceptWaveform(buf) != 0 {
			var res FullResult
			_ = json.Unmarshal([]byte(t.recognizer.Result()), &res)

			t.results <- &res
		} else {
			var res PartialResult
			_ = json.Unmarshal([]byte(t.recognizer.PartialResult()), &res)
			if res.Partial != "" {
				t.results <- &res
			}
		}
	}
}

func (t *Titler) Results() <-chan Result {
	return t.results
}
