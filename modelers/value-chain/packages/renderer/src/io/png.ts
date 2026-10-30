/** Blob -> Base64 (without the data-URL prefix), e.g. to post it to a VS Code extension host. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the export blob."));
    reader.readAsDataURL(blob);
  });
}
