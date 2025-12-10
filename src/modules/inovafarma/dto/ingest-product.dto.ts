import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class PharmacyInfoDto {
  @IsString()
  cnpj: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class IngestProductDto {
  @IsInt()
  productId: number;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ean?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsInt()
  stock?: number;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  ncm?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  imageLink?: string;

  @IsObject()
  rawJson: Record<string, unknown>;

  @Type(() => PharmacyInfoDto)
  @ValidateNested()
  @IsObject()
  pharmacy: PharmacyInfoDto;
}
