export default function shortenFileName(
  fileName: string,
  maxLength: number
): string {
  const split = fileName.split(".");
  const fileExtension = split.pop();
  let name = split.join(".");

  if (name.length > maxLength) {
    name = name.substring(0, maxLength);
  }

  return name + "." + fileExtension;
}
