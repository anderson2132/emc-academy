import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

export class RegisterDto {
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres` })
  @MaxLength(PASSWORD_MAX)
  password: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  fullName: string;
}

export class LoginDto {
  /** Correo o nombre de usuario. */
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  login: string;

  @IsString()
  @MaxLength(PASSWORD_MAX)
  password: string;
}

export class TokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}

export class EmailDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres` })
  @MaxLength(PASSWORD_MAX)
  password: string;
}
