export default ({
  role,
  issue,
  candidates,
}: {
  role: string;
  issue: { number: number };
  candidates: { provider: string; model: string; reading: unknown }[];
}) => {
  if (
    role !== "implementation" ||
    issue.number !== 1 ||
    candidates.some(({ model, reading }) => !model || !reading)
  )
    throw new Error("invalid input");
  return candidates.map(({ provider }) => provider).reverse();
};
