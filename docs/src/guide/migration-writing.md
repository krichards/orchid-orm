# Writing a migration

All column names will be translated to snake_case if `snakeCase` option is set to true in `rakeDb` options.

Use a `change` function for changing the database schema, it accepts a callback with `db` and optionally you can use a second argument `up` to know if it is an up migration or down.

```ts
import { change } from '../dbScript';

change(async (db, up) => {
  if (up) {
    console.log('migrate is called');
  } else {
    console.log('rollback is called');
  }
});
```

A single migration file can have multiple `change`'s.

It's useful when creating a database schema or enum, and then creating a table that depends on it.

When migrating, `change`s are executed from top to bottom, so the schema and the enum will be created before the table.

On rollback, `change`s are executed from bottom to top, so the schema and the enum will be dropped **after** the table that is using them.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createSchema('custom');
  await db.createEnum('yearSeason', ['spring', 'summer', 'fall', 'winter']);
});

change(async (db) => {
  await db.createTable('custom.table', (t) => ({
    id: t.identity().primaryKey(),
    season: t.enum('yearSeason'),
  }));
});
```

`db` is an extended query builder, so it has [all the same methods](/guide/query-methods) as a query builder and additional specific methods such as `createTable`, `changeTable`, and others.

Example of creating a table and populating it with values:

```ts
import { change } from '../src';

change(async (db, up) => {
  const { table } = await db.createTable('languages', (t) => ({
    id: t.identity().primaryKey(),
    name: t.string().unique(),
    code: t.string().unique(),
  }));

  // it's important to use this `up` check to not run the queries on rollback
  if (up) {
    // TS knows the column types, so this will be type-checked:
    await table.createMany([
      { name: 'Ukrainian', code: 'ua' },
      { name: 'English', code: 'en' },
      { name: 'Polish', code: 'pl' },
      { name: 'Belarusian', code: 'be' },
      { name: 'French', code: 'fr' },
    ]);

    // use db.query to perform raw SQL queries
    const language = 'Ukrainian';
    const { rows } = await db.query`
      SELECT * FROM languages WHERE name = ${language}
    `;
    console.log(rows);
  }
});
```

## createTable, dropTable

[//]: # 'has JSDoc'

`createTable` accepts a string for a table name, optional options, and a callback to specify columns.

`dropTable` accepts the same arguments, it will drop the table when migrating and create a table when rolling back.

When creating a table within a specific schema, write the table name with schema name: `'schemaName.tableName'`.

Returns object `{ table: TableInterface }` that allows to insert records right after creating a table.

Options are:

```ts
type TableOptions = {
  // used when reverting a `createTable`
  dropMode?: 'CASCADE' | 'RESTRICT';

  // add a database comment on the table
  comment?: string;

  // by default, it will throw an error when the table has no primary key
  // set `noPrimaryKey` to `true` to bypass it
  noPrimaryKey?: boolean;

  // override rakeDb `snakeCase` option for only this table
  snakeCase?: boolean;
};
```

Example:

```ts
import { change } from '../dbScript';

change(async (db, up) => {
  // call `createTable` with options
  await db.createTable(
    'table',
    {
      comment: 'Table comment',
      dropMode: 'CASCADE',
      noPrimaryKey: true,
    },
    (t) => ({
      // ...
    }),
  );

  // call without options
  const { table } = await db.createTable('user', (t) => ({
    id: t.identity().primaryKey(),
    email: t.text().unique(),
    name: t.text(),
    active: t.boolean().nullable(),
    ...t.timestamps(),
  }));

  // create records only when migrating up
  if (up) {
    // table is a db table interface, all query methods are available
    await table.createMany([...data]);
  }
});
```

## changeTable

[//]: # 'has JSDoc'

`changeTable` accepts a table name, optional options, and a special callback with column changes.

When changing a table within a specific schema, write the table name with schema name: `'schemaName.tableName'`.

Options are:

```ts
type ChangeTableOptions = {
  comment?:
    | // add a comment to the table on migrating, remove a comment on rollback
    string // change comment from first to second on migrating, from second to first on rollback
    | [string, string] // remove a comment on both migrate and rollback
    | null;

  // override rakeDb `snakeCase` option for only this table
  snakeCase?: boolean;
};
```

The callback of the `changeTable` is different from `createTable` in the way that it expects columns to be wrapped in change methods such as `add`, `drop`, and `change`.

## add, drop

`add` will add a column (or a check) on migrating, and remove it on rollback.

`drop` will remove a column (or a check) on migrating, and add it on rollback.

The column in `add` or `drop` can have all the same methods as when creating a table, such methods as `index`, `unique`, and `foreignKey`.

Supports adding a composite primary key, foreign key, and index, and all the same as when creating a table.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.changeTable('table', (t) => ({
    // add column
    column1: t.add(t.text()),

    // remove column
    column2: t.drop(t.boolean()),

    // add a check to the column
    column3: t.add(t.check(t.sql`column3 > 5`)),

    // remove a check from the column
    column4: t.drop(t.check(t.sql`column4 > 5`)),

    // add composite primary key:
    ...t.add(t.primaryKey(['foo', 'bar'])),

    // add composite index:
    ...t.add(t.index(['foo', 'bar'])),

    // add composite unique index:
    ...t.add(t.unique(['foo', 'bar'])),

    // add composite foreign key:
    ...t.add(
      t.foreignKey(['foo', 'bar'], 'otherTable', ['otherFoo', 'otherBar']),
    ),

    // add a table check
    ...t.add(t.check(t.sql`column3 > column4`)),

    // add a constraint
    ...t.add(
      t.constraint({
        name: 'constraintName',
        check: t.sql`column3 < 20`,
        foreignKey: [['foo', 'bar'], 'otherTable', ['otherFoo', 'otherBar']],
      }),
    ),

    // add timestamps:
    ...t.add(t.timestamps()),
  }));
});
```

## change

Takes an array of two columns (or checks).
When migrating, it will change the column to the second element,
and when doing rollback will change the column to the first element.

Dropping or creating a primary key on multiple columns is allowed.

Index options are listed [here](/guide/migration-column-methods.html#index).

Foreign key options are listed [here](/guide/migration-column-methods.html#foreignkey).

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.changeTable('table', (t) => ({
    // change column type from integer to string
    column1: t.change(t.integer(), t.string()),

    // change column type using SQL expression to convert data
    column2: t.change(t.integer(), t.string(), {
      usingUp: t.sql`column2::text`,
      usingDown: t.sql`column2::integer`,
    }),

    // change column default
    column3: t.change(t.default(1), t.default(2)),

    // change column default with raw SQL
    column4: t.change(t.default(t.sql`2 + 2`), t.default(t.sql`3 + 3`)),

    // change column to be nullable or non-nullable
    column5: t.change(t.nonNullable(), t.nullable()),
    column6: t.change(t.nullable(), t.nonNullable()),

    // change column comment
    column7: t.change(t.comment('from comment'), t.comment('to comment')),

    // add index
    column8: t.change(t.integer(), t.integer().index()),

    // remove index
    column9: t.change(t.integer().index(), t.integer()),

    // change index
    column10: t.change(
      t.integer().index({
        // index options to be applied when migrating down
      }),
      t.integer().index({
        // index options to be applied when migrating up
      }),
    ),

    // add primary key
    column11: t.change(t.integer(), t.integer().primaryKey()),

    // drop primary key
    column12: t.change(t.integer().primaryKey(), t.integer()),

    // add foreign key
    column13: t.change(
      t.integer(),
      t.integer().foreignKey('otherTable', 'otherTableId'),
    ),

    // remove foreign key
    column14: t.change(
      t.integer().foreignKey('otherTable', 'otherTableId'),
      t.integer(),
    ),

    // change foreign key
    column15: t.change(
      t.integer().foreignKey('oneTable', 'oneColumn', {
        // foreign key options to be applied when migrating up
        name: 'oneForeignKeyName',
        match: 'PARTIAL',
        onUpdate: 'RESTRICT',
        onDelete: 'SET DEFAULT',
      }),
      t.integer().foreignKey('otherTable', 'otherColumn', {
        // foreign key options to be applied when migrating down
        name: 'otherForeignKeyName',
        match: 'FULL',
        onUpdate: 'NO ACTION',
        onDelete: 'CASCADE',
      }),
    ),

    // change various column properties at once
    column16: t.change(
      t
        .integer()
        .collate('de_DE')
        .default(123)
        .comprssion('pglz')
        .comment('from comment')
        .index({ name: 'oneIndexName' })
        .foreignKey('oneTable', 'oneColumn', {
          name: 'oneForeignKeyName',
        }),
      t
        .text()
        .collate('es_ES')
        .default('123')
        .compression('lz4')
        .comment('to comment')
        .nullable()
        .index({ name: 'otherIndexName' })
        .foreignKey('otherTable', 'otherColumn', {
          name: 'otherForeignKeyName',
        }),
    ),

    column17: t.change(
      // change from this check:
      t.check(t.sql`column17 > 5`),
      // to this check:
      t.check(t.sql`column17 < 10`),
    ),
  }));
});
```

## rename

Rename a column:

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.changeTable('table', (t) => ({
    oldColumnName: t.rename('newColumnName'),
  }));
});
```

## renameTable

[//]: # 'has JSDoc'

Rename a table:

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.renameTable('oldTableName', 'newTableName');
});
```

## addColumn, dropColumn

[//]: # 'has JSDoc'

Add a column to the table on migrating, and remove it on rollback.

`dropColumn` takes the same arguments, removes a column on migrate, and adds it on rollback.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.addColumn('tableName', 'columnName', (t) =>
    t.integer().index().nullable(),
  );
});
```

## addIndex, dropIndex

[//]: # 'has JSDoc'

Add an index to the table on migrating, and remove it on rollback.

`dropIndex` takes the same arguments, removes the index on migrate, and adds it on rollback.

The first argument is the table name, other arguments are the same as in [composite index](#composite-index).

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.addIndex(
    'tableName',
    ['column1', { column: 'column2', order: 'DESC' }],
    {
      name: 'indexName',
    },
  );
});
```

## addForeignKey, dropForeignKey

[//]: # 'has JSDoc'

Add a foreign key to a table on migrating, and remove it on rollback.

`dropForeignKey` takes the same arguments, removes the foreign key on migrate, and adds it on rollback.

Arguments:

- table name
- column names in the table
- other table name
- column names in the other table
- options:
  - `name`: constraint name
  - `match`: 'FULL', 'PARTIAL', or 'SIMPLE'
  - `onUpdate` and `onDelete`: 'NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', or 'SET DEFAULT'

The first argument is the table name, other arguments are the same as in [composite foreign key](#composite-foreign-key).

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.addForeignKey(
    'tableName',
    ['id', 'name'],
    'otherTable',
    ['foreignId', 'foreignName'],
    {
      name: 'constraintName',
      match: 'FULL',
      onUpdate: 'RESTRICT',
      onDelete: 'CASCADE',
    },
  );
});
```

## addPrimaryKey, dropPrimaryKey

[//]: # 'has JSDoc'

Add a primary key to a table on migrate, and remove it on rollback.

`dropPrimaryKey` takes the same arguments, removes the primary key on migrate, and adds it on rollback.

First argument is a table name, second argument is an array of columns.
The optional third argument may have a name for the primary key constraint.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.addPrimaryKey('tableName', ['id', 'name'], {
    name: 'tablePkeyName',
  });
});
```

## addCheck, dropCheck

[//]: # 'has JSDoc'

Add or drop a check for multiple columns.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.addCheck('tableName', t.sql`column > 123`);
});
```

## addConstraint, dropConstraint

[//]: # 'has JSDoc'

Add or drop a constraint with check and a foreign key references.

See foreign key details in [foreign key](/guide/migration-column-methods.html#composite-foreign-key).

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.addConstraint('tableName', {
    name: 'constraintName',
    check: db.sql`column > 123`,
    references: [['id', 'name'], 'otherTable', ['otherId', 'otherName']],
  });
});
```

## renameColumn

[//]: # 'has JSDoc'

Rename a column:

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.renameColumn('tableName', 'oldColumnName', 'newColumnName');
});
```

## createEnum, dropEnum

[//]: # 'has JSDoc'

`createEnum` creates an enum on migrate, drops it on rollback.

`dropEnum` does the opposite.

Third argument for options is optional.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createEnum('number', ['one', 'two', 'three']);

  // use `schemaName.enumName` format to specify a schema
  await db.createEnum('customSchema.mood', ['sad', 'ok', 'happy'], {
    // following options are used when dropping enum
    dropIfExists: true,
    cascade: true,
  });
});
```

## createSchema, dropSchema

[//]: # 'has JSDoc'

`createSchema` creates a database schema, and removes it on rollback.

`dropSchema` takes the same arguments, removes schema on migration, and adds it on rollback.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createSchema('schemaName');
});
```

## createExtension, dropExtension

[//]: # 'has JSDoc'

`createExtension` creates a database extension, and removes it on rollback.

`dropExtension` takes the same arguments, removes the extension on migrate, and adds it on rollback.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createExtension('pg_trgm');
});
```

## createDomain, dropDomain

[//]: # 'has JSDoc'

Domain is a custom database type that allows to predefine a `NOT NULL` and a `CHECK` (see [postgres tutorial](https://www.postgresqltutorial.com/postgresql-tutorial/postgresql-user-defined-data-types/)).

`createDomain` and `dropDomain` take a domain name as first argument, callback returning inner column type as a second, and optional object with parameters as third.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createDomain('domainName', (t) => t.integer(), {
    check: db.sql`value = 42`,
  });

  // use `schemaName.domainName` format to specify a schema
  await db.createDomain('schemaName.domainName', (t) => t.text(), {
    // unlike columns, domain is nullable by default, use notNull when needed:
    notNull: true,
    collation: 'C',
    default: db.sql`'default text'`,
    check: db.sql`length(value) > 10`,

    // cascade is used when dropping domain
    cascade: true,
  });
});
```

## createCollation, dropCollation

[//]: # 'has JSDoc'

Create and drop a database collation, (see [Postgres docs](https://www.postgresql.org/docs/current/sql-createcollation.html)).

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createCollation('myCollation', {
    // This is a shortcut for setting lcCollate and lcCType at once.
    locale: 'en-u-kn-true',

    // set `lcType` and `lcCType` only if the `locale` is not set.
    // lcType: 'C',
    // lcCType: 'C',

    // provider can be 'icu' or 'libc'. 'libc' is a default.
    provider: 'icu',

    // true by default, false is only supported with 'icu' provider.
    deterministic: true,

    // Is intended to by used by `pg_upgrade`. Normally, it should be omitted.
    version: '1.2.3',

    // For `CREATE IF NOT EXISTS` when creating.
    createIfNotExists: true,

    // For `DROP IF EXISTS` when dropping.
    dropIfExists: true,

    // For `DROP ... CASCADE` when dropping.
    cascase: true,
  });
});
```

Instead of specifying the collation options, you can specify a collation to copy options from.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createCollation('myCollation', {
    fromExisting: 'otherCollation',
  });
});
```

To create a collation withing a specific database schema, prepend it to the collation name:

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createCollation('schemaName.myCollation', {
    // `fromExisting` also can accept a collation name with a schema.
    fromExisting: 'schemaName.otherCollation',
  });
});
```

## createView, dropView

[//]: # 'has JSDoc'

Create and drop database views.

Provide SQL as a string or via `db.sql` that can accept variables.

```ts
import { change } from '../dbScript';

change(async (db) => {
  await db.createView(
    'simpleView',
    `
    SELECT a.one, b.two
    FROM a
    JOIN b ON b."aId" = a.id
  `,
  );

  // view can accept db.sql with variables in such way:
  const value = 'some value';
  await db.createView(
    'viewWithVariables',
    db.sql`
      SELECT * FROM a WHERE key = ${value}
    `,
  );

  // view with options
  await db.createView(
    'schemaName.recursiveView',
    {
      // createOrReplace has effect when creating the view
      createOrReplace: true,

      // dropIfExists and dropMode have effect when dropping the view
      dropIfExists: true,
      dropMode: 'CASCADE',

      // for details, check Postgres docs for CREATE VIEW,
      // these options are matching CREATE VIEW options
      temporary: true,
      recursive: true,
      columns: ['n'],
      with: {
        checkOption: 'LOCAL', // or 'CASCADED'
        securityBarrier: true,
        securityInvoker: true,
      },
    },
    `
      VALUES (1)
      UNION ALL
      SELECT n + 1 FROM "schemaName"."recursiveView" WHERE n < 100;
    `,
  );
});
```

## tableExists

[//]: # 'has JSDoc'

Returns boolean to know if table exists:

```ts
import { change } from '../dbScript';

change(async (db) => {
  if (await db.tableExists('tableName')) {
    // ...do something
  }
});
```

## columnExists

[//]: # 'has JSDoc'

Returns boolean to know if a column exists:

Note that when `snakeCase` option is set to true, this method won't translate column to snake case, unlike other parts.

```ts
import { change } from '../dbScript';

change(async (db) => {
  if (await db.columnExists('tableName', 'columnName')) {
    // ...do something
  }
});
```

## constraintExists

[//]: # 'has JSDoc'

Returns boolean to know if constraint exists:

```ts
import { change } from '../dbScript';

change(async (db) => {
  if (await db.constraintExists('constraintName')) {
    // ...do something
  }
});
```
