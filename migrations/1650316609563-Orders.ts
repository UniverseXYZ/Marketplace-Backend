import {MigrationInterface, QueryRunner} from "typeorm";

export class Orders1650316609563 implements MigrationInterface {
    name = 'Orders1650316609563'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "matched_tx_hash" type jsonb using to_jsonb("matched_tx_hash")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "matched_tx_hash" type character varying`);
    }

}
