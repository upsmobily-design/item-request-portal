import { Entity, PrimaryColumn, Column, OneToMany, BeforeInsert, BeforeUpdate } from 'typeorm';
import { ItemRequestLine } from './ItemRequestLine';

@Entity('XXMOBILY_ITEM_REQUEST_HEADERS')
export class ItemRequest {
  @PrimaryColumn({ name: 'REQUEST_ID', type: 'varchar2', length: 50 })
  id: string;

  @Column({ name: 'SEQUENCE_NUMBER', type: 'varchar2', length: 30, unique: true, nullable: true })
  sequence_number: string | null;

  @Column({ name: 'JUSTIFICATION', type: 'varchar2', length: 4000, nullable: true })
  justification: string | null;

  @Column({ name: 'STATUS', type: 'varchar2', length: 30 })
  status: string;

  @Column({ name: 'ATTACHMENT_NAME', type: 'varchar2', length: 255, nullable: true })
  attachment_name: string | null;

  @Column({ name: 'ATTACHMENT_CLOB', type: 'clob', nullable: true })
  attachment_clob: string | null; // Stores base64 encoded data file content

  @Column({ name: 'REQUESTER_USERNAME', type: 'varchar2', length: 100, nullable: true })
  requester_username: string | null;

  @Column({ name: 'REQUESTER_EMAIL', type: 'varchar2', length: 100, nullable: true })
  requester_email: string | null;

  @Column({ name: 'DRAFT_SAVED_AT', type: 'timestamp', nullable: true })
  draft_saved_at: Date | null;

  @Column({ name: 'SUBMITTED_AT', type: 'timestamp', nullable: true })
  submitted_at: Date | null;

  @Column({ name: 'CREATION_DATE', type: 'timestamp' })
  creationDate: Date;

  @Column({ name: 'LAST_UPDATE_DATE', type: 'timestamp' })
  lastUpdateDate: Date;

  @OneToMany(() => ItemRequestLine, line => line.request, { cascade: true })
  lines: ItemRequestLine[];

  @BeforeInsert()
  setCreationDates() {
    this.creationDate = new Date();
    this.lastUpdateDate = new Date();
  }

  @BeforeUpdate()
  setUpdateDates() {
    this.lastUpdateDate = new Date();
  }
}
