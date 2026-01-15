import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConfigurationHistory1737410559284 implements MigrationInterface {
  name = 'AddConfigurationHistory1737410559284';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create configuration_history table
    await queryRunner.query(`
      CREATE TABLE "company_chat"."configuration_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "configurationId" integer NOT NULL,
        "version" integer NOT NULL,
        "action" character varying NOT NULL,
        "changedBy" character varying,
        "snapshot" jsonb NOT NULL,
        "changeComment" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_configuration_history_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_configuration_version" UNIQUE ("configurationId", "version")
      )
    `);

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_configuration_history_configurationId" ON "company_chat"."configuration_history" ("configurationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_configuration_history_changedBy" ON "company_chat"."configuration_history" ("changedBy")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_configuration_history_createdAt" ON "company_chat"."configuration_history" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_configuration_history_configurationId_version" ON "company_chat"."configuration_history" ("configurationId", "version")`,
    );

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "company_chat"."configuration_history"
      ADD CONSTRAINT "FK_configuration_history_configurationId"
      FOREIGN KEY ("configurationId")
      REFERENCES "company_chat"."configurations"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "company_chat"."configuration_history"
      ADD CONSTRAINT "FK_configuration_history_changedBy"
      FOREIGN KEY ("changedBy")
      REFERENCES "company_chat"."users"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "company_chat"."configuration_history" DROP CONSTRAINT IF EXISTS "FK_configuration_history_changedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_chat"."configuration_history" DROP CONSTRAINT IF EXISTS "FK_configuration_history_configurationId"`,
    );

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "company_chat"."IDX_configuration_history_configurationId_version"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "company_chat"."IDX_configuration_history_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "company_chat"."IDX_configuration_history_changedBy"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "company_chat"."IDX_configuration_history_configurationId"`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS "company_chat"."configuration_history"`);
  }
}
