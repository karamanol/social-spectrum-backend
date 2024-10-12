export const getErrorMessage = function (err: unknown): string {
  let message: string;
  if (err instanceof Error) {
    message = err.message;
  } else if (err && err instanceof Object && "message" in err) {
    message = String(err.message);
  } else if (typeof err === "string") {
    message = err;
  } else {
    return "Unknown error ";
  }
  return message;
};
