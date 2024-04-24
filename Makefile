ROOT=$(shell git rev-parse --show-toplevel)
VOSK_LIB=vosk-linux-x86_64-0.3.45
VOSK_PATH=${ROOT}/${VOSK_LIB}

.PHONY: run
run: 
	LD_LIBRARY_PATH=${VOSK_PATH} CGO_CPPFLAGS="-I ${VOSK_PATH}" CGO_LDFLAGS="-L ${VOSK_PATH}" go run . -f test.wav

.PHONY: build
build: 
	LD_LIBRARY_PATH=${VOSK_PATH} CGO_CPPFLAGS="-I ${VOSK_PATH}" CGO_LDFLAGS="-L ${VOSK_PATH}" go build -o transcribe main.go

.PHONY: models
models: lib
	echo "Getting Models"
	curl -LO https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
	curl -LO https://alphacephei.com/vosk/models/vosk-model-ru-0.42.zip
	unzip vosk-model-en-us-0.22.zip
	unzip vosk-model-ru-0.42.zip

.PHONY: lib
lib:
	echo "Getting Vosk Lib"
	curl -LO https://github.com/alphacep/vosk-api/releases/download/v0.3.45/${VOSK_LIB}.zip
	unzip ${VOSK_LIB}.zip
