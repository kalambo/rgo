import { GraphQLResolveInfo } from 'graphql';

interface BatchCallbacks {
  resolve: (value?: any | PromiseLike<any>) => void;
  reject: (reason?: any) => void;
}

interface Batch {
  sources: any[];
  args: any;
  context: any;
  info: GraphQLResolveInfo;
  callbacks: BatchCallbacks[];
}

type BatchResolveFunc =
  (sources: any[], args: any, context: any, info: GraphQLResolveInfo) => any[] | Promise<any[]>;

const resolveBatches = async (batchResolveFn: BatchResolveFunc, batches: Batch[]) => {
  for (const { sources, args, context, info, callbacks } of batches) {
    try {
      const values = await batchResolveFn(sources, args, context, info);
      callbacks.forEach(({ resolve, reject }, i) => {
        if (values[i] instanceof Error) reject(values[i]);
        else resolve(values[i]);
      });
    } catch (error) {
      callbacks.forEach(({ reject }) => reject(error));
    }
  }
}

class Batcher {

  private batchResolveFn: BatchResolveFunc;
  private batches = new Map<string, Batch>();
  private hasScheduledResolve: boolean = false;

  constructor(batchResolveFn: BatchResolveFunc) {
    this.batchResolveFn = batchResolveFn;
    this.batches = new Map();
  }

  public add(
    source: any, args: any, context: any, info: GraphQLResolveInfo,
    resolve: (value?: any | PromiseLike<any>) => void, reject: (reason?: any) => void,
  ) {

    const batchKey = `${context.rootQuery}:${JSON.stringify(info.fieldNodes)}`;

    let batch = this.batches.get(batchKey);
    if (!batch) {
      batch = { sources: [], args, context, info, callbacks: [] };
      this.batches.set(batchKey, batch);
    }

    batch.sources.push(source);
    batch.callbacks.push({ resolve, reject });

    if (!this.hasScheduledResolve) {
      this.hasScheduledResolve = true;
      process.nextTick(() => {
        const tickBatches = Array.from(this.batches.values());
        this.batches.clear();
        resolveBatches(this.batchResolveFn, tickBatches);
        this.hasScheduledResolve = false;
      });
    }
  }
}

export default function batchResolve(batchResolveFn: BatchResolveFunc) {
  const batcher = new Batcher(batchResolveFn);
  return (source: any, args: any, context: any, info: GraphQLResolveInfo) => (
    new Promise<any>((res, rej) => batcher.add(source, args, context, info, res, rej))
  );
}
