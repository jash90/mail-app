const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withMinDeploymentTarget(config, minTarget = '16.0') {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const propsPath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile.properties.json',
      );
      const props = JSON.parse(fs.readFileSync(propsPath, 'utf-8'));
      props['ios.deploymentTarget'] = minTarget;
      fs.writeFileSync(propsPath, JSON.stringify(props, null, 2) + '\n');
      return config;
    },
  ]);
};
