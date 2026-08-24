export const normalizeCommand = (command: string): string => {
  if (command.endsWith("\r\n") || command.endsWith("\n")) return command;
  return `${command}\r\n`;
};
