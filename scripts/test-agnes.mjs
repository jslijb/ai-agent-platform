fetch('https://api.agnes-ai.cn/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + process.env.AGNES_KEY
  },
  body: JSON.stringify({
    model: 'agnes-2.5-flash',
    messages: [{ role: 'user', content: '回复测试成功' }],
    temperature: 0,
    tools: [{
      type: 'function',
      function: {
        name: 'calculateMA',
        description: '计算MA',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'number' }, description: '价格序列' },
            period: { type: 'number', description: '周期' }
          },
          required: ['period']
        }
      }
    }]
  })
}).then(r => r.text()).then(t => console.log(t.slice(0, 500))).catch(e => console.error(e.message));