export function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatStatus(value: string) {
  return titleCase(value.replace("_", " "));
}

export function makeUploadFile(uri: string, fallbackName: string, mimeType: string) {
  const name = uri.split("/").pop() || fallbackName;
  return { uri, name, type: mimeType };
}
