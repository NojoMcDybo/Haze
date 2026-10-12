# Mitgelieferte Modelle

## ttm-r2-360-60-ft-l1.onnx

- **Modell:** IBM Granite TimeSeries TTM r2 (TinyTimeMixer), Revision `360-60-ft-l1-r2.1` von `ibm-granite/granite-timeseries-ttm-r2` (Hugging Face).
  - 668.595 Parameter.
  - 360 Werte Vorlauf (30 h bei 5 Minuten), 60 Werte Vorhersage; Haze nutzt die ersten 12 (60 min).
  - Frequenz-Token 3 = 5 Minuten.
- **Lizenz:** Apache License 2.0, © IBM Corp. Text: https://www.apache.org/licenses/LICENSE-2.0. Das Modell ist unverändert nach ONNX umgewandelt, an den Gewichten wurde nichts trainiert oder geändert.
- **Export:** `tools/export-ttm.py` (torch 2.11, dynamo-Exporter, Opset 18). Die größte Abweichung zu PyTorch liegt bei 7·10⁻⁶.
- **SHA-256:** `bc3c134654afd3c6a47557634b95625d7cfc88121db9b7db688310d86fdce0cc`. `desktop/ttm.mjs` prüft das vor jedem Laden; bei Abweichung wird das Modell nicht genutzt.
- **Laufzeit:** onnxruntime-web 1.30.0 (WebAssembly, MIT, © Microsoft Corporation), in `desktop/vendor/onnxruntime-web/`, ebenfalls mit festen Prüfsummen.
- **Einsatz:** nur im Prognose-Experiment (nicht belastbar). Es läuft lokal im Analyse-Thread und muss dieselbe Rückwärtsprüfung bestehen wie die übrigen Modelle.
