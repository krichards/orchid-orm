import { Client } from 'pg';
import {
  Adapter,
  columnTypes,
  createDb,
  testTransaction,
} from '../../qb/pqb/src';
import { MaybeArray, toArray } from 'orchid-core';

export const testDbOptions = {
  databaseURL: process.env.PG_URL,
};

export const testDbClient = new Client({
  connectionString: testDbOptions.databaseURL,
});

export const testAdapter = new Adapter(testDbOptions);

export const testColumnTypes = {
  ...columnTypes,
  text(min = 0, max = Infinity) {
    return columnTypes.text(min, max);
  },
  timestamp() {
    return columnTypes.timestamp().parse((input) => new Date(input));
  },
  timestampNoTZ() {
    return columnTypes.timestampNoTZ().parse((input) => new Date(input));
  },
};

export const testDb = createDb({
  adapter: testAdapter,
  columnTypes: testColumnTypes,
});

export const line = (s: string) =>
  s.trim().replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')');

export const expectSql = (
  sql: MaybeArray<{ text: string; values: unknown[] }>,
  text: string,
  values: unknown[] = [],
) => {
  toArray(sql).forEach((item) => {
    expect(item.text).toBe(line(text));
    expect(item.values).toEqual(values);
  });
};

type AssertEqual<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

export const assertType = <T, Expected>(
  ..._: AssertEqual<T, Expected> extends true ? [] : ['invalid type']
) => {
  // noop
};

export const now = new Date();

export const asMock = (fn: unknown) => fn as jest.Mock;

export const useTestDatabase = () => {
  beforeAll(async () => {
    await testTransaction.start(testDb);
  });

  beforeEach(async () => {
    await testTransaction.start(testDb);
  });

  afterEach(async () => {
    await testTransaction.rollback(testDb);
  });

  afterAll(async () => {
    await testTransaction.close(testDb);
  });
};
