# Upstream license copies

The preparation script includes these notices beside the unchanged vendor worker, WASM and models. Source files retrieved 2026-11-01:

- `PADDLE-LICENSE.txt`: <https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/LICENSE>
- `ONNX-LICENSE.txt`: <https://raw.githubusercontent.com/microsoft/onnxruntime/v1.24.3/LICENSE>
- `OPENCV-LICENSE.txt`: <https://raw.githubusercontent.com/opencv/opencv/4.11.0/LICENSE>

The pinned SDK embeds OpenCV.js. Its package and ONNX Runtime's package omit root license files from the published tarballs, so preparation copies these checked-in notices rather than depending on an additional runtime request.
