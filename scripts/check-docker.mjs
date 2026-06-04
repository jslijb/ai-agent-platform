fetch('https://hub.docker.com/v2/repositories/paddlepaddle/paddle/tags?page_size=5')
  .then(r => r.json())
  .then(d => d.results.map(t => t.name).join(', '))
  .then(console.log)
  .catch(e => console.log('FAIL:', e.message));
