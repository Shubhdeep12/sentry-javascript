import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';
import axios from 'axios';

test('Sends successful transaction', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' && transactionEvent?.transaction === 'GET /test-success'
    );
  });

  await axios.get(`${baseURL}/test-success`);

  const transactionEvent = await pageloadTransactionEventPromise;
  const transactionEventId = transactionEvent.event_id;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      url: 'http://localhost:3030/test-success',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': 'http://localhost:3030/test-success',
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/test-success',
      'http.user_agent': 'axios/1.6.7',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-success',
    },
    op: 'http.server',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
    origin: 'auto.http.otel.http',
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      transaction: 'GET /test-success',
      type: 'transaction',
      transaction_info: {
        source: 'route',
      },
    }),
  );
});

test('Sends parameterized transactions to Sentry', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('node-hapi', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-param/{param}'
    );
  });

  await axios.get(`${baseURL}/test-param/123`);

  const transactionEvent = await pageloadTransactionEventPromise;
  const transactionEventId = transactionEvent.event_id;

  expect(transactionEvent?.contexts?.trace?.op).toBe('http.server');
  expect(transactionEvent?.contexts?.trace?.data?.['http.route']).toBe('/test-param/{param}');
  expect(transactionEvent?.transaction).toBe('GET /test-param/{param}');
});

test('Isolates requests', async ({ baseURL }) => {
  const transaction1Promise = waitForTransaction('node-hapi', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.contexts?.trace?.data?.['http.target'] === '/test-param/888'
    );
  });
  const transaction2Promise = waitForTransaction('node-hapi', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.contexts?.trace?.data?.['http.target'] === '/test-param/999'
    );
  });

  await Promise.all([axios.get(`${baseURL}/test-param/888`), axios.get(`${baseURL}/test-param/999`)]);

  const transaction1 = await transaction1Promise;
  const transaction2 = await transaction2Promise;

  expect(transaction1.tags).toEqual({ 'param-888': 'yes' });
  expect(transaction2.tags).toEqual({ 'param-999': 'yes' });
});
