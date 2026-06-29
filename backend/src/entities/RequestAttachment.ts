import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('request_attachments')
export class RequestAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  request_id: string;

  @Column()
  file_name: string;

  @Column()
  file_path: string;

  @Column()
  uploaded_by: string;

  @CreateDateColumn()
  uploaded_at: Date;
}
