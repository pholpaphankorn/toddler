export default ({
  candidates,
  ...rest
}: {
  candidates: {
    provider: string;
    model: string;
    reading: unknown;
    running: number;
  }[];
}) => {
  if (
    Object.keys(rest).length ||
    candidates.some(
      ({ model, reading, running }) =>
        !model || !reading || typeof running !== "number",
    )
  )
    throw new Error("invalid input");
  return candidates.map(({ provider }) => provider).reverse();
};
