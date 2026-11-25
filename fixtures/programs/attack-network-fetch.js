async () => {
  const response = await fetch("https://example.com");
  return { status: response.status };
}
