import { Entity, PrimaryColumn, Column, BeforeInsert } from 'typeorm';

@Entity('XXMOBILY_ITEM_STATUS_HISTORY')
export class RequestStatusHistory {
  @PrimaryColumn({ name: 'HISTORY_ID', type: 'varchar2', length: 50 })
  id: string;

  @Column({ name: 'REQUEST_ID', type: 'varchar2', length: 50 })
  request_id: string;

  @Column({ name: 'FROM_STATUS', type: 'varchar2', length: 30, nullable: true })
  from_status: string | null;

  @Column({ name: 'TO_STATUS', type: 'varchar2', length: 30 })
  to_status: string;

  @Column({ name: 'ACTOR_USERNAME', type: 'varchar2', length: 100 })
  actor_username: string;

  @Column({ name: 'ACTOR_ROLE', type: 'varchar2', length: 50 })
  actor_role: string;

  @Column({ name: 'PENDING_APPROVER_EMAIL', type: 'varchar2', length: 100, nullable: true })
  pending_approver_email: string | null;

  @Column({ name: 'PENDING_APPROVAL_LEVEL', type: 'number', precision: 1, scale: 0, nullable: true })
  pending_approval_level: number | null;

  @Column({ name: 'COMMENTS', type: 'varchar2', length: 4000, nullable: true })
  comments: string | null;

  @Column({ name: 'CREATION_DATE', type: 'timestamp' })
  creationDate: Date;

  @BeforeInsert()
  setCreationDate() {
    this.creationDate = new Date();
  }
}
