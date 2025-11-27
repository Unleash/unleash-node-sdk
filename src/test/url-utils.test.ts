import { test } from 'vitest';
import getUrl, { suffixSlash } from '../url-utils';

test('geturl should return url with project query parameter if projectname is provided', (t) => {
  const result = getUrl('http://unleash-app.com', 'myProject');
  t.is(result, 'http://unleash-app.com/client/features?project=myProject');
});

test('geturl should return url without project if projectname is not provided', (t) => {
  const result = getUrl('http://unleash-app.com');
  t.is(result, 'http://unleash-app.com/client/features');
});

test('geturl should return url with namePrefix if namePrefix is provided', (t) => {
  const result = getUrl('http://unleash-app.com', '', 'unleash');
  t.is(result, 'http://unleash-app.com/client/features?namePrefix=unleash');
});

test('geturl should return url with namePrefix and project both are provided', (t) => {
  const result = getUrl('http://unleash-app.com', 'myProject', 'unleash');
  t.is(result, 'http://unleash-app.com/client/features?project=myProject&namePrefix=unleash');
});

test('geturl should return url with namePrefix, project and tags if all provided', (t) => {
  const result = getUrl('http://unleash-app.com', 'myProject', 'unleash', ['tagName:tagValue']);
  t.is(
    result,
    'http://unleash-app.com/client/features?project=myProject&namePrefix=unleash&tag=tagName%3AtagValue',
  );
});

test('geturl should return url with tags if tags are provided', (t) => {
  const result = getUrl('http://unleash-app.com', '', '', ['tagName:tagValue']);
  t.is(result, 'http://unleash-app.com/client/features?tag=tagName%3AtagValue');
});

test('geturl should return url with two tags if two tags are provided', (t) => {
  const result = getUrl('http://unleash-app.com', '', '', [
    'tagName:tagValue',
    'tagName2:tagValue2',
  ]);
  t.is(
    result,
    'http://unleash-app.com/client/features?tag=tagName%3AtagValue&tag=tagName2%3AtagValue2',
  );
});

test('suffix slash should append / on url missing /', (t) => {
  const result = suffixSlash('http://unleash-app.com/api');
  t.is(result, 'http://unleash-app.com/api/');
});

test('suffix slash does not append / on url already ending with /', (t) => {
  const result = suffixSlash('http://unleash-app.com/api/');
  t.is(result, 'http://unleash-app.com/api/');
});
