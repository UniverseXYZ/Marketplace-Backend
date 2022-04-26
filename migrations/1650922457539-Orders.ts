import {MigrationInterface, QueryRunner} from "typeorm";

export class Orders1650922457539 implements MigrationInterface {
    name = 'Orders1650922457539'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "erc1155_token_balance" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "erc1155_token_balance"`);
    }

}
