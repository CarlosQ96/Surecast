import type { GatsbyNode } from 'gatsby';

export const onCreateWebpackConfig: GatsbyNode['onCreateWebpackConfig'] = ({
  actions,
  getConfig,
}) => {
  const config = getConfig();

  if (config.plugins) {
    config.plugins = config.plugins.filter(
      (plugin: { constructor: { name: string } }) =>
        plugin.constructor.name !== 'ESLintWebpackPlugin',
    );
  }

  actions.replaceWebpackConfig(config);
};
