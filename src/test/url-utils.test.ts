import { expect, test } from 'vitest';
import getUrl, { suffixSlash } from '../url-utils';

test('geturl should return url with project query parameter if projectname is provided', () => {
  const result = getUrl('http://unleash-app.com', 'myProject');
  expect(result).toEqual('http://unleash-app.com/client/features?project=myProject');
});

test('geturl should return url without project if projectname is not provided', () => {
  const result = getUrl('http://unleash-app.com');
  expect(result).toEqual('http://unleash-app.com/client/features');
});

test('geturl should return url with namePrefix if namePrefix is provided', () => {
  const result = getUrl('http://unleash-app.com', '', 'unleash');
  expect(result).toEqual('http://unleash-app.com/client/features?namePrefix=unleash');
});

test('geturl should return url with namePrefix and project both are provided', () => {
  const result = getUrl('http://unleash-app.com', 'myProject', 'unleash');
  expect(result).toEqual(
    'http://unleash-app.com/client/features?project=myProject&namePrefix=unleash',
  );
});

test('geturl should return url with namePrefix, project and tags if all provided', () => {
  const result = getUrl('http://unleash-app.com', 'myProject', 'unleash', ['tagName:tagValue']);
  expect(result).toEqual(
    'http://unleash-app.com/client/features?project=myProject&namePrefix=unleash&tag=tagName%3AtagValue',
  );
});

test('geturl should return url with tags if tags are provided', () => {
  const result = getUrl('http://unleash-app.com', '', '', ['tagName:tagValue']);
  expect(result).toEqual('http://unleash-app.com/client/features?tag=tagName%3AtagValue');
});

test('geturl should return url with two tags if two tags are provided', () => {
  const result = getUrl('http://unleash-app.com', '', '', [
    'tagName:tagValue',
    'tagName2:tagValue2',
  ]);
  expect(result).toEqual(
    'http://unleash-app.com/client/features?tag=tagName%3AtagValue&tag=tagName2%3AtagValue2',
  );
});

test('suffix slash should append / on url missing /', () => {
  const result = suffixSlash('http://unleash-app.com/api');
  expect(result).toEqual('http://unleash-app.com/api/');
});

test('suffix slash does not append / on url already ending with /', () => {
  const result = suffixSlash('http://unleash-app.com/api/');
  expect(result).toEqual('http://unleash-app.com/api/');
});
