# Third-Party Notices

LexiFlow builds a local learning dictionary from multiple open data sources and
uses third-party runtime/model components for optional local text-to-speech.
The source code of LexiFlow and the licenses of bundled/generated data and model
components are separate matters; redistributors must preserve the notices and
comply with the licenses below.

## ECDICT

LexiFlow can bundle ECDICT English-Chinese dictionary data prepared from:

- Project: `skywind3000/ECDICT`
- Source: https://github.com/skywind3000/ECDICT
- License: MIT

MIT License

Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Simple English Wiktionary / Wiktextract / kaikki.org

LexiFlow Core can use machine-readable data extracted from the Simple English
edition of Wiktionary by Wiktextract and distributed by kaikki.org.

- Data page: https://kaikki.org/simplewiktionary/
- Raw data: https://kaikki.org/simplewiktionary/rawdata.html
- Extractor: https://github.com/tatuylonen/wiktextract
- Wiktionary licenses: Creative Commons Attribution-ShareAlike (CC BY-SA) and
  GNU Free Documentation License (GFDL), as described by Wiktionary/kaikki.org.

The generated `core-lexicon.sqlite` may contain adapted Wiktionary data such as
parts of speech, English glosses, usage examples, IPA transcriptions, and links
to Wikimedia Commons pronunciation media. Preserve attribution and the
applicable share-alike/license requirements when redistributing that data.

Wiktextract citation requested by kaikki.org:
Tatu Ylonen, "Wiktextract: Wiktionary as Machine-Readable Structured Data",
Proceedings of LREC 2022, pp. 1317-1325.

## CC-CEDICT

LexiFlow Core uses CC-CEDICT as a Chinese-headword-first source for building the
local Chinese-to-English candidate index.

- Project / publisher: CC-CEDICT, published by MDBG
- Source information: https://www.mdbg.net/chinese/dictionary?page=cc-cedict
- Export used by the build script:
  https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
- License: Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0)
- License text: https://creativecommons.org/licenses/by-sa/4.0/

CC-CEDICT is a community-maintained Chinese-English dictionary originally based
on CEDICT by Paul Andrew Denisowski. Preserve attribution and CC BY-SA 4.0
requirements when redistributing the generated Chinese alias index.

## Kokoro-82M / kokoro-js

LexiFlow can use Kokoro-82M locally as a natural English text-to-speech fallback
when a real dictionary/Wikimedia pronunciation recording is unavailable.

- Model: `onnx-community/Kokoro-82M-v1.0-ONNX`
- Base model: `hexgrad/Kokoro-82M`
- JavaScript runtime: `kokoro-js`
- Runtime source: https://github.com/IsmaCortGtz/kokoro-js
- Model page: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- License: Apache License 2.0

The Kokoro model is downloaded to the user's local LexiFlow data directory on
first use and is not generated from or dependent on the Windows system voice.
Redistributors should preserve the Apache-2.0 notices shipped with the npm/model
artifacts and comply with their respective license terms.
