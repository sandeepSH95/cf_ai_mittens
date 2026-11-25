async () => {
  try {
    const response = await fetch("https://example.com");
    return { reached: true, status: response.status };
  } catch (error) {
    return { reached: false, message: String(error) };
  }
}
