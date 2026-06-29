import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, BeforeInsert, BeforeUpdate } from 'typeorm';
import { ItemRequest } from './ItemRequest';

@Entity('XXMOBILY_ITEM_REQUEST_LINES')
export class ItemRequestLine {
  @PrimaryColumn({ name: 'LINE_ID', type: 'varchar2', length: 50 })
  id: string;

  @Column({ name: 'REQUEST_ID', type: 'varchar2', length: 50 })
  request_id: string;

  @ManyToOne(() => ItemRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'REQUEST_ID' })
  request: ItemRequest;

  @Column({ name: 'ITEM_CLASS', type: 'varchar2', length: 150 })
  item_class: string;

  @Column({ name: 'DESCRIPTION', type: 'varchar2', length: 255 })
  description: string;

  @Column({ name: 'PRIMARY_UOM', type: 'varchar2', length: 30 })
  primary_uom: string;

  @Column({ name: 'S1_BU', type: 'varchar2', length: 10 })
  s1_bu: string;

  @Column({ name: 'S2_ASSET_SEG', type: 'varchar2', length: 30 })
  s2_asset_seg: string;

  @Column({ name: 'S3_ASSET_CAT', type: 'varchar2', length: 30 })
  s3_asset_cat: string;

  @Column({ name: 'S4_ASSET_CLASS', type: 'varchar2', length: 30 })
  s4_asset_class: string;

  @Column({ name: 'CONCAT_CODE', type: 'varchar2', length: 100 })
  concat_code: string;

  @Column({ name: 'ITEM_TYPE', type: 'varchar2', length: 50, nullable: true })
  item_type: string;

  @Column({ name: 'TAGGABLE', type: 'varchar2', length: 10, nullable: true })
  taggable: string;

  @Column({ name: 'ASSET_ITEM', type: 'varchar2', length: 10, nullable: true })
  asset_item: string;

  @Column({ name: 'ASSET_CATEGORY', type: 'varchar2', length: 150, nullable: true })
  asset_category: string;

  @Column({ name: 'LOCAL_CONTENT', type: 'varchar2', length: 10 })
  local_content: string;

  @Column({ name: 'MATCHING', type: 'number', precision: 5, scale: 2, nullable: true })
  matching: number | null;

  @Column({ name: 'LINE_STATUS', type: 'varchar2', length: 30, default: 'PENDING' })
  line_status: string;

  @Column({ name: 'REJECTION_COMMENTS', type: 'varchar2', length: 1000, nullable: true })
  rejection_comments: string | null;

  @Column({ name: 'BYPASS_JUSTIFICATION', type: 'varchar2', length: 1000, nullable: true })
  bypass_justification: string;

  @Column({ name: 'ERP_ITEM_NUMBER', type: 'varchar2', length: 50, nullable: true })
  erp_item_number: string | null;

  @Column({ name: 'ERP_STATUS', type: 'varchar2', length: 30, default: 'PENDING' })
  erp_status: string | null;

  @Column({ name: 'INPUT_PAYLOAD', type: 'clob', nullable: true })
  input_payload: string | null;

  @Column({ name: 'OUTPUT_PAYLOAD', type: 'clob', nullable: true })
  output_payload: string | null;

  @Column({ name: 'CREATION_DATE', type: 'timestamp' })
  creationDate: Date;

  @Column({ name: 'LAST_UPDATE_DATE', type: 'timestamp' })
  lastUpdateDate: Date;

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
