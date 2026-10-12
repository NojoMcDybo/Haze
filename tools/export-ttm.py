# Export von IBM Granite TimeSeries TTM r2 (Apache-2.0) nach ONNX für Haze (desktop/models/ttm-r2-360-60-ft-l1.onnx).
# Einmalig auf dem Entwicklungsrechner, nicht Teil der App. Benötigt: Python 3.11, torch (CPU), granite-tsfm, onnx, onnxscript, onnxruntime.
# Aufruf: python -X utf8 tools/export-ttm.py   → schreibt ttm-r2-360-60-ft-l1.onnx und prüft die Gleichheit mit PyTorch.
import hashlib, os, numpy as np, onnx, onnxruntime as ort, torch
from tsfm_public.models.tinytimemixer import TinyTimeMixerForPrediction

REPO, REVISION, CONTEXT, FREQ_5MIN = "ibm-granite/granite-timeseries-ttm-r2", "360-60-ft-l1-r2.1", 360, 3
model = TinyTimeMixerForPrediction.from_pretrained(REPO, revision=REVISION); model.eval()

class Wrap(torch.nn.Module):
    def __init__(self, m): super().__init__(); self.m = m
    def forward(self, past_values, freq_token): return self.m(past_values=past_values, freq_token=freq_token).prediction_outputs

# Der ältere TorchScript-Export verrechnet sich beim Frequenz-Token (MatMul-Größen), deshalb der neue Exporter (dynamo, Opset 18).
tmp = "ttm-export-tmp.onnx"
torch.onnx.export(Wrap(model), (torch.randn(1, CONTEXT, 1), torch.full((1,), FREQ_5MIN, dtype=torch.long)), tmp,
                  input_names=["past_values", "freq_token"], output_names=["prediction"], opset_version=18, dynamo=True)
out = "ttm-r2-360-60-ft-l1.onnx"
onnx.save_model(onnx.load(tmp, load_external_data=True), out, save_as_external_data=False)  # eine Datei statt .onnx + .data
for f in (tmp, tmp + ".data"):
    if os.path.exists(f): os.remove(f)

session, diff = ort.InferenceSession(out), 0.0
for k in range(20):
    x = (np.random.randn(1, CONTEXT, 1) * (1 + k)).astype(np.float32); f = np.full((1,), FREQ_5MIN, dtype=np.int64)
    with torch.no_grad(): ref = Wrap(model)(torch.tensor(x), torch.tensor(f)).numpy()
    diff = max(diff, float(np.abs(session.run(None, {"past_values": x, "freq_token": f})[0] - ref).max()))
print("max. Abweichung zu PyTorch:", diff, "sha256:", hashlib.sha256(open(out, "rb").read()).hexdigest())
