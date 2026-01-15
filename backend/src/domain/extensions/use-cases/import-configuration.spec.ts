import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigurationEntity, ExtensionEntity, UserGroupEntity } from 'src/domain/database';
import { ExplorerService } from '../services';
import { ImportConfigurationHandler } from './import-configuration';

describe('ImportConfigurationHandler', () => {
  let handler: ImportConfigurationHandler;
  let configurationRepository: Repository<ConfigurationEntity>;
  let extensionRepository: Repository<ExtensionEntity>;
  let userGroupRepository: Repository<UserGroupEntity>;
  let explorerService: ExplorerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportConfigurationHandler,
        {
          provide: getRepositoryToken(ConfigurationEntity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ExtensionEntity),
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserGroupEntity),
          useValue: {
            findBy: jest.fn(),
          },
        },
        {
          provide: ExplorerService,
          useValue: {
            getExtension: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<ImportConfigurationHandler>(ImportConfigurationHandler);
    configurationRepository = module.get<Repository<ConfigurationEntity>>(getRepositoryToken(ConfigurationEntity));
    extensionRepository = module.get<Repository<ExtensionEntity>>(getRepositoryToken(ExtensionEntity));
    userGroupRepository = module.get<Repository<UserGroupEntity>>(getRepositoryToken(UserGroupEntity));
    explorerService = module.get<ExplorerService>(ExplorerService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should import configuration successfully', async () => {
    const data = {
      version: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      name: 'Imported Config',
      description: 'Imported Description',
      enabled: true,
      agentName: 'Test Agent',
      userGroupIds: [],
      extensions: [],
    };

    const mockCreatedConfig = {
      id: 1,
      ...data,
    };

    jest.spyOn(configurationRepository, 'create').mockReturnValue(mockCreatedConfig as any);
    jest.spyOn(configurationRepository, 'save').mockResolvedValue(mockCreatedConfig as any);

    const result = await handler.execute({ data });

    expect(result.configuration).toBeDefined();
    expect(configurationRepository.create).toHaveBeenCalled();
    expect(configurationRepository.save).toHaveBeenCalled();
  });

  it('should throw BadRequestException when extension does not exist', async () => {
    const data = {
      version: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      name: 'Test Config',
      description: 'Test',
      enabled: true,
      extensions: [
        {
          name: 'NonExistentExtension',
          enabled: true,
          values: {},
        },
      ],
    };

    jest.spyOn(configurationRepository, 'create').mockReturnValue({} as any);
    jest.spyOn(explorerService, 'getExtension').mockReturnValue(undefined);

    await expect(handler.execute({ data })).rejects.toThrow(BadRequestException);
    await expect(handler.execute({ data })).rejects.toThrow("Extension 'NonExistentExtension' is not available in this system");
  });

  it('should import configuration with user groups', async () => {
    const mockUserGroups = [
      { id: 'group1', name: 'Group 1' },
      { id: 'group2', name: 'Group 2' },
    ];

    const data = {
      version: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      name: 'Config with Groups',
      description: 'Test',
      enabled: true,
      userGroupIds: ['group1', 'group2'],
      extensions: [],
    };

    const mockCreatedConfig = {
      id: 1,
      ...data,
      userGroups: mockUserGroups,
    };

    jest.spyOn(userGroupRepository, 'findBy').mockResolvedValue(mockUserGroups as any);
    jest.spyOn(configurationRepository, 'create').mockReturnValue(mockCreatedConfig as any);
    jest.spyOn(configurationRepository, 'save').mockResolvedValue(mockCreatedConfig as any);

    const result = await handler.execute({ data });

    expect(result.configuration).toBeDefined();
    expect(userGroupRepository.findBy).toHaveBeenCalledWith({ id: expect.anything() });
  });

  it('should import configuration with extensions', async () => {
    const mockExtensionSpec = {
      name: 'test-extension',
      title: 'Test Extension',
      description: 'Test',
      type: 'tool' as const,
      arguments: {},
    };

    const data = {
      version: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      name: 'Config with Extension',
      description: 'Test',
      enabled: true,
      extensions: [
        {
          name: 'test-extension',
          enabled: true,
          values: { key: 'value' },
        },
      ],
    };

    const mockCreatedConfig = {
      id: 1,
      ...data,
    };

    jest.spyOn(explorerService, 'getExtension').mockReturnValue({ spec: mockExtensionSpec } as any);
    jest.spyOn(extensionRepository, 'create').mockReturnValue({} as any);
    jest.spyOn(configurationRepository, 'create').mockReturnValue(mockCreatedConfig as any);
    jest.spyOn(configurationRepository, 'save').mockResolvedValue(mockCreatedConfig as any);

    const result = await handler.execute({ data });

    expect(result.configuration).toBeDefined();
    expect(explorerService.getExtension).toHaveBeenCalledWith('test-extension');
  });

  it('should warn when importing with different version', async () => {
    const originalVersion = process.env.VERSION;
    process.env.VERSION = '2.0.0';

    const data = {
      version: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      name: 'Config with Different Version',
      description: 'Test',
      enabled: true,
      extensions: [],
    };

    const mockCreatedConfig = {
      id: 1,
      ...data,
    };

    const loggerWarnSpy = jest.spyOn(handler['logger'], 'warn');

    jest.spyOn(configurationRepository, 'create').mockReturnValue(mockCreatedConfig as any);
    jest.spyOn(configurationRepository, 'save').mockResolvedValue(mockCreatedConfig as any);

    await handler.execute({ data });

    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Importing configuration with different version'));

    // Restore original version
    if (originalVersion) {
      process.env.VERSION = originalVersion;
    } else {
      delete process.env.VERSION;
    }
  });

  it('should throw BadRequestException when extension validation fails', async () => {
    const mockExtensionSpec = {
      name: 'test-extension',
      title: 'Test Extension',
      description: 'Test',
      type: 'tool' as const,
      arguments: {
        requiredField: {
          type: 'string' as const,
          title: 'Required Field',
          required: true,
        },
      },
    };

    const data = {
      version: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      name: 'Config with Invalid Extension',
      description: 'Test',
      enabled: true,
      extensions: [
        {
          name: 'test-extension',
          enabled: true,
          values: {}, // Missing required field
        },
      ],
    };

    jest.spyOn(explorerService, 'getExtension').mockReturnValue({ spec: mockExtensionSpec } as any);
    jest.spyOn(configurationRepository, 'create').mockReturnValue({} as any);

    await expect(handler.execute({ data })).rejects.toThrow(BadRequestException);
    await expect(handler.execute({ data })).rejects.toThrow(/Invalid configuration for extension/);
  });
});
