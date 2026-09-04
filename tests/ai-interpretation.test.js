'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/ai-interpretation');

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; }
  };
}

function request(body, overrides = {}) {
  const serialized = JSON.stringify(body);
  const { headers = {}, ...requestOverrides } = overrides;
  return {
    method: 'POST',
    headers: {
      host: 'tsiframir.ru',
      origin: 'https://tsiframir.ru',
      'content-type': 'application/json',
      'x-requested-with': 'tsiframir-calculator',
      'content-length': String(Buffer.byteLength(serialized)),
      'x-vercel-forwarded-for': '203.0.113.20',
      ...headers
    },
    body,
    ...requestOverrides
  };
}

test('AI endpoint rejects cross-origin, non-JSON and unexpected personal fields', async () => {
  let res = response();
  await handler(request({ number: 7, calculatorType: 'birthDate' }, {
    headers: { origin: 'https://attacker.example', host: 'tsiframir.ru', 'content-type': 'application/json' }
  }), res);
  assert.equal(res.statusCode, 403);

  res = response();
  await handler(request({ number: 7, calculatorType: 'birthDate' }, {
    headers: { origin: '', host: 'tsiframir.ru', 'content-type': 'application/json' }
  }), res);
  assert.equal(res.statusCode, 403);

  res = response();
  await handler(request({ number: 7, calculatorType: 'birthDate' }, {
    headers: { origin: 'http://tsiframir.ru', host: 'tsiframir.ru', 'content-type': 'application/json' }
  }), res);
  assert.equal(res.statusCode, 403);

  res = response();
  await handler(request({ number: 7, calculatorType: 'birthDate' }, {
    headers: { origin: 'https://tsiframir.ru', host: 'tsiframir.ru', 'content-type': 'application/json', 'x-requested-with': '' }
  }), res);
  assert.equal(res.statusCode, 403);

  res = response();
  await handler(request({ number: 7, calculatorType: 'birthDate' }, {
    headers: { origin: 'https://tsiframir.ru', host: 'tsiframir.ru', 'content-type': 'text/plain' }
  }), res);
  assert.equal(res.statusCode, 415);

  res = response();
  await handler(request({
    number: 7,
    calculatorType: 'birthDate',
    calculationTrace: 'Иван, 01.01.1990'
  }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'invalid_request');
});

test('AI endpoint sends only a validated numeric result and calculator type to OpenAI', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  const { requestWindows } = handler._test;
  requestWindows.clear();
  process.env.OPENAI_API_KEY = 'test-key';
  let providerRequest;
  global.fetch = async (url, options) => {
    providerRequest = { url, options };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Безличная интерпретация' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    };
  };
  try {
    const res = response();
    await handler(request({ number: 8, calculatorType: 'compatibility' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.equal(providerRequest.url, 'https://api.openai.com/v1/chat/completions');
    const providerBody = JSON.parse(providerRequest.options.body);
    const prompt = providerBody.messages.map((message) => message.content).join('\n');
    assert.match(prompt, /числа 8/);
    assert.doesNotMatch(prompt, /Иван|01\.01\.1990/i);
  } finally {
    requestWindows.clear();
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('AI endpoint rate limiter fails closed after the bounded request window', () => {
  const { isRateLimited, requestWindows } = handler._test;
  requestWindows.clear();
  const req = request({ number: 7, calculatorType: 'birthDate' });
  for (let index = 0; index < 8; index += 1) assert.equal(isRateLimited(req, 1000), false);
  assert.equal(isRateLimited(req, 1000), true);
  requestWindows.clear();
});
