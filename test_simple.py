#!/usr/bin/env python3

import subprocess
import sys
import json

from vosk import Model, KaldiRecognizer, SetLogLevel

SAMPLE_RATE = 16000

SetLogLevel(0)

model = Model(lang="en-us")
rec = KaldiRecognizer(model, SAMPLE_RATE)

rec.SetWords(True)
rec.SetPartialWords(True)

with subprocess.Popen(["ffmpeg", "-loglevel", "quiet", "-i",
                            sys.argv[1],
                            "-ar", str(SAMPLE_RATE) , "-ac", "1", "-f", "s16le", "-"],
                            stdout=subprocess.PIPE) as process:

    while True:
        data = process.stdout.read(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            res = json.loads(rec.Result())
            print("Result:")
            print(res["text"])
        else:
            res = json.loads(rec.PartialResult())
            if res["partial"] != "":
                print("Partial:")
                print(res["partial"])

    print(rec.FinalResult())