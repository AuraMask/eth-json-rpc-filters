process.on('unhandledRejection', function(err) {
  throw err;
});

require('./logs');
