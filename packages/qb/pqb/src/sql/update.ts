import { Query } from '../query';
import { addValue, quoteSchemaAndTable } from './common';
import { pushReturningSql } from './insert';
import { pushWhereStatementSql } from './where';
import { ToSqlCtx } from './toSql';
import {
  QueryHookSelect,
  UpdateQueryData,
  UpdateQueryDataItem,
  UpdateQueryDataObject,
} from './data';
import { isExpression, pushOrNewArray } from 'orchid-core';
import { Db } from '../db';
import { joinSubQuery } from '../utils';
import { JsonItem } from './types';
import { jsonToSql } from './select';

export const pushUpdateSql = (
  ctx: ToSqlCtx,
  table: Query,
  query: UpdateQueryData,
  quotedAs: string,
): QueryHookSelect | undefined => {
  const quotedTable = quoteSchemaAndTable(query.schema, table.table as string);
  ctx.sql.push(`UPDATE ${quotedTable}`);

  if (quotedTable !== quotedAs) {
    ctx.sql.push(`AS ${quotedAs}`);
  }

  ctx.sql.push('SET');

  const set: string[] = [];
  processData(ctx, table, set, query.updateData, quotedAs);
  ctx.sql.push(set.join(', '));

  pushWhereStatementSql(ctx, table, query, quotedAs);
  return pushReturningSql(ctx, table, query, quotedAs, query.afterUpdateSelect);
};

const processData = (
  ctx: ToSqlCtx,
  table: Query,
  set: string[],
  data: UpdateQueryDataItem[],
  quotedAs?: string,
) => {
  let append: UpdateQueryDataItem[] | undefined;
  const QueryClass = ctx.queryBuilder.constructor as Db;

  for (const item of data) {
    if (typeof item === 'function') {
      const result = item(data);
      if (result) append = pushOrNewArray(append, result);
    } else if (isExpression(item)) {
      set.push(item.toSQL(ctx, quotedAs));
    } else {
      const shape = table.q.shape;
      for (const key in item) {
        const value = item[key];
        if (value === undefined) continue;

        set.push(
          `"${shape[key].data.name || key}" = ${processValue(
            ctx,
            table,
            QueryClass,
            key,
            value,
            quotedAs,
          )}`,
        );
      }
    }
  }

  if (append) processData(ctx, table, set, append, quotedAs);
};

const processValue = (
  ctx: ToSqlCtx,
  table: Query,
  QueryClass: Db,
  key: string,
  value: UpdateQueryDataObject[string],
  quotedAs?: string,
) => {
  if (value && typeof value === 'object') {
    if ((value as JsonItem).__json) {
      return jsonToSql(table, value as JsonItem, ctx.values, quotedAs);
    } else if (isExpression(value)) {
      return value.toSQL(ctx, quotedAs);
    } else if (value instanceof QueryClass) {
      return `(${joinSubQuery(table, value as Query).toSql(ctx).text})`;
    } else if ('op' in value && 'arg' in value) {
      return `"${table.q.shape[key].data.name || key}" ${
        (value as { op: string }).op
      } ${addValue(ctx.values, (value as { arg: unknown }).arg)}`;
    }
  }

  return addValue(ctx.values, value);
};
