import {MigrationInterface, QueryRunner} from "typeorm";

export class CreateOrderTable1636020569594 implements MigrationInterface {
    name = 'CreateOrderTable1636020569594'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "status" integer NOT NULL, "hash" character varying NOT NULL, "type" character varying NOT NULL, "side" integer NOT NULL, "maker" character varying NOT NULL, "make" jsonb NOT NULL, "taker" character varying NOT NULL, "take" jsonb NOT NULL, "salt" numeric NOT NULL, "start" numeric NOT NULL, "end" numeric NOT NULL, "data" jsonb NOT NULL, "signature" character varying NOT NULL, "fill" character varying NOT NULL, "make_stock" character varying NOT NULL, "make_balance" character varying NOT NULL, "cancelled_tx_hash" character varying, "matched_tx_hash" character varying, CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_775c9f06fc27ae3ff8fb26f2c4" ON "orders" ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_13ab9c024e81573c05451b9004" ON "orders" ("hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_e3f9ee9fdff1479a797ea2fdca" ON "orders" ("maker") `);
        await queryRunner.query(`CREATE INDEX "IDX_78304afc10a76bd2b1a190d056" ON "orders" ("make") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_78304afc10a76bd2b1a190d056"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e3f9ee9fdff1479a797ea2fdca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_13ab9c024e81573c05451b9004"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_775c9f06fc27ae3ff8fb26f2c4"`);
        await queryRunner.query(`DROP TABLE "orders"`);
    }

}
