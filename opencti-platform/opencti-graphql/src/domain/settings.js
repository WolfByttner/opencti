import { getHeapStatistics } from 'v8';
import semver from 'semver';
import { createEntity, loadById, updateAttribute, loadEntity } from '../database/middleware';
import conf, {
  BUS_TOPICS,
  ENABLED_EXPIRED_MANAGER,
  ENABLED_RULE_ENGINE,
  ENABLED_TASK_SCHEDULER,
  ENABLED_SUBSCRIPTION_MANAGER,
  PLATFORM_VERSION,
  ENABLED_SYNC_MANAGER,
} from '../config/conf';
import { delEditContext, getRedisVersion, notify, setEditContext } from '../database/redis';
import { elVersion } from '../database/elasticSearch';
import { getRabbitMQVersion } from '../database/rabbitmq';
import { ENTITY_TYPE_SETTINGS } from '../schema/internalObject';
import { SYSTEM_USER } from '../utils/access';

export const getMemoryStatistics = () => {
  return { ...process.memoryUsage(), ...getHeapStatistics() };
};

export const getModules = () => {
  const modules = [];
  modules.push({ id: 'EXPIRATION_SCHEDULER', enable: ENABLED_EXPIRED_MANAGER });
  modules.push({ id: 'TASK_MANAGER', enable: ENABLED_TASK_SCHEDULER });
  modules.push({ id: 'RULE_ENGINE', enable: ENABLED_RULE_ENGINE });
  modules.push({ id: 'SUBSCRIPTION_MANAGER', enable: ENABLED_SUBSCRIPTION_MANAGER });
  modules.push({ id: 'SYNC_MANAGER', enable: ENABLED_SYNC_MANAGER });
  return modules;
};

export const getApplicationInfo = () => ({
  version: PLATFORM_VERSION,
  memory: getMemoryStatistics(),
  dependencies: [
    { name: 'Search engine', version: elVersion().then((v) => `${v.distribution || 'elk'} - ${v.number}`) },
    { name: 'RabbitMQ', version: getRabbitMQVersion() },
    { name: 'Redis', version: getRedisVersion() },
  ],
  debugStats: {}, // Lazy loaded
});

export const getSettings = async () => {
  const platformSettings = await loadEntity(SYSTEM_USER, [ENTITY_TYPE_SETTINGS]);
  const elasticInfo = await elVersion();
  const esPlatform = elasticInfo.distribution || 'elk'; // opensearch or elasticsearch
  const esVersion = elasticInfo.number;
  const featureFlags = [
    // List of specific feature flags
    { id: 'RUNTIME_SORTING', enable: esPlatform === 'elk' && semver.satisfies(esVersion, '>=7.12.x') },
  ];
  return {
    ...platformSettings,
    platform_enable_reference: conf.get('app:enforce_references'),
    platform_feature_flags: featureFlags,
  };
};

export const addSettings = async (user, settings) => {
  const created = await createEntity(user, settings, ENTITY_TYPE_SETTINGS);
  return notify(BUS_TOPICS.Settings.ADDED_TOPIC, created, user);
};

export const settingsCleanContext = (user, settingsId) => {
  delEditContext(user, settingsId);
  return loadById(user, settingsId, ENTITY_TYPE_SETTINGS).then((settings) =>
    notify(BUS_TOPICS.Settings.EDIT_TOPIC, settings, user)
  );
};

export const settingsEditContext = (user, settingsId, input) => {
  setEditContext(user, settingsId, input);
  return loadById(user, settingsId, ENTITY_TYPE_SETTINGS).then((settings) =>
    notify(BUS_TOPICS.Settings.EDIT_TOPIC, settings, user)
  );
};

export const settingsEditField = async (user, settingsId, input) => {
  const { element } = await updateAttribute(user, settingsId, ENTITY_TYPE_SETTINGS, input);
  return notify(BUS_TOPICS.Settings.EDIT_TOPIC, element, user);
};
