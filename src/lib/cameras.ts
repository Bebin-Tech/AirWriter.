export type CameraDevice = { deviceId: string; label: string };

export async function listVideoDevices(): Promise<CameraDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

export async function openCamera(deviceId?: string | null): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 960 },
    frameRate: { ideal: 30 },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

export async function attach(el: HTMLVideoElement, stream: MediaStream) {
  el.srcObject = stream;
  await el.play();
  if (!el.videoWidth) {
    await new Promise((r) => el.addEventListener('loadedmetadata', r, { once: true }));
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
