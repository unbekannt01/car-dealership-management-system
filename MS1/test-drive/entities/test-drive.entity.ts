/* eslint-disable prettier/prettier */
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class TestDrive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  userId: string;

  @Column()
  carId: string;

  @Column()
  carBrand: string;

  @Column()
  carModel: string;

  @Column({ type: 'date' })
  scheduledDate: string;

  @Column()
  scheduledTime: string;

  @Column({ default: 'Pending' })
  status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';

  @Column({ default: false })
  isRescheduled: boolean;

  @Column({ default: 'KP Group' })
  dealerName: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ default: 'A-22(KP-Group), Mall Road, Near NCR, Delhi' })
  dealerAddress: string;

  @Column()
  message: string;

  @Column()
  cancellationReason: string;
}

// @Column()
// role : UserRole