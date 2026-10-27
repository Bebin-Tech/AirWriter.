export async function listVideoDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

export async function openCamera(deviceId, { width = 1280, height = 960 } = {}) {
  const video = { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30 } };
  if (deviceId) video.deviceId = { exact: deviceId };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

export async function attach(videoEl, stream) {
  videoEl.srcObject = stream;
  await videoEl.play();
  if (!videoEl.videoWidth) {
    await new Promise((r) => videoEl.addEventListener('loadedmetadata', r, { once: true }));
  }
  return videoEl;
}

export function stop(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}
