import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import mongoose, { Schema } from 'mongoose';
import type { Run } from '../../packages/shared/contracts';
import { defaults, type Catalog, type Persistence } from './store';

const catalogSchema = new Schema(
  {
    _id: String,
    record: { type: Schema.Types.Mixed as unknown as typeof Object, required: true },
  },
  { timestamps: true, versionKey: false },
);
const runSchema = new Schema(
  {
    _id: String,
    projectId: { type: String, required: true },
    startedAt: { type: Date, required: true, index: true },
    record: { type: Schema.Types.Mixed as unknown as typeof Object, required: true },
  },
  { timestamps: true, versionKey: false },
);

export async function connectMongo(
  uri: string,
  artifacts: string,
  dbName?: string,
): Promise<Persistence> {
  const root = resolve(artifacts);
  await mkdir(root, { recursive: true });
  const connection = mongoose.createConnection(uri, {
    dbName,
    maxPoolSize: 8,
    serverSelectionTimeoutMS: 5000,
    bufferCommands: false,
  });
  try {
    await connection.asPromise();
    const catalogModel = connection.model('BreakTraceCatalog', catalogSchema);
    const runModel = connection.model('BreakTraceRun', runSchema);
    await Promise.all([catalogModel.init(), runModel.init()]);
    return {
      mode: 'mongo',
      directory: (id) => join(root, id),
      async catalog() {
        const stored = await catalogModel.findById('workspace').lean().exec();
        return { ...defaults(), ...(stored?.record as Partial<Catalog> | undefined) };
      },
      async saveCatalog(catalog) {
        await catalogModel
          .updateOne({ _id: 'workspace' }, { $set: { record: catalog } }, { upsert: true })
          .exec();
      },
      async runs() {
        const rows = await runModel.find().sort({ startedAt: -1 }).limit(150).lean().exec();
        return rows.map(({ record }) => record as Run);
      },
      async getRun(id) {
        return (await runModel.findById(id).lean().exec())?.record as Run | undefined;
      },
      async saveRun(run) {
        await runModel
          .updateOne(
            { _id: run.id },
            {
              $set: { projectId: run.project.id, startedAt: new Date(run.createdAt), record: run },
            },
            { upsert: true },
          )
          .exec();
      },
      close: () => connection.close().then(() => {}),
    };
  } catch {
    await connection.close().catch(() => {});
    throw new Error('MongoDB connection or index setup failed');
  }
}
