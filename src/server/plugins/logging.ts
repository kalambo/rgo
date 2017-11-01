import { Plugin } from '../typings';

export default {
  onCommit({ type, id, data, prev }) {
    if (data) {
      if (prev) {
        console.log(
          `rgo-mutate-update, ${type}:${id}, ` +
            `old: ${JSON.stringify(prev)}, new: ${JSON.stringify(data)}`,
        );
      } else {
        console.log(
          `rgo-mutate-insert, ${type}:${id}, new: ${JSON.stringify(data)}`,
        );
      }
    } else {
      console.log(
        `rgo-mutate-delete, ${type}:${id}, old: ${JSON.stringify(prev)}`,
      );
    }
  },
} as Plugin;
