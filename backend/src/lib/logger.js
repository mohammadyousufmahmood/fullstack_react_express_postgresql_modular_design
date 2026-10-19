function write(level, message, fields = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

const logger = {
  info(message, fields) {
    write('info', message, fields);
  },
  warn(message, fields) {
    write('warn', message, fields);
  },
  error(message, fields) {
    write('error', message, fields);
  },
};

module.exports = logger;
