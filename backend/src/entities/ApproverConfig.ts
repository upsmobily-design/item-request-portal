import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('XXMOBILY_ITEM_APPROVERS_CONFIG')
export class ApproverConfig {
  @PrimaryColumn({ name: 'CLASS', type: 'varchar2', length: 150 })
  class: string;

  @Column({ name: 'APPROVER1', type: 'varchar2', length: 100 })
  approver1: string;

  @Column({ name: 'APPROVER2', type: 'varchar2', length: 100, nullable: true })
  approver2: string | null;

  @Column({ name: 'APPROVER3', type: 'varchar2', length: 100, nullable: true })
  approver3: string | null;

  @CreateDateColumn({ name: 'CREATION_DATE', type: 'timestamp' })
  creationDate: Date;

  @UpdateDateColumn({ name: 'LAST_UPDATE_DATE', type: 'timestamp' })
  lastUpdateDate: Date;
}
