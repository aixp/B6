/*
	Alexander Shiryaev, 2021.06
*/

#include "COMPorts0.h"

#include <assert.h>

#if defined(WIN32) || defined(_WIN32) || defined(__WIN32__) || defined(__NT__)

#define COMPORTS0_IN_QUEUE 8192
#define COMPORTS0_OUT_QUEUE 8192

// #include <winbase.h>
#include <windows.h>

static void EncodeBaud (COMPORTS0_BAUD baud, COMPORTS0_BAUD *res, int *ok)
{
	*ok = 1;
	switch (baud) {
	case 110:
		*res = CBR_110;
		break;
	case 300:
		*res = CBR_300;
		break;
	case 600:
		*res = CBR_600;
		break;
	case 1200:
		*res = CBR_1200;
		break;
	case 2400:
		*res = CBR_2400;
		break;
	case 4800:
		*res = CBR_4800;
		break;
	case 9600:
		*res = CBR_9600;
		break;
	case 14400:
		*res = CBR_14400;
		break;
	case 19200:
		*res = CBR_19200;
		break;
	case 38400:
		*res = CBR_38400;
		break;
	case 56000:
		*res = CBR_56000;
		break;
	case 57600:
		*res = CBR_57600;
		break;
	case 115200:
		*res = CBR_115200;
		break;
	case 128000:
		*res = CBR_128000;
		break;
	case 230400:
		*res = 230400;
		break;
	case 256000:
		*res = CBR_256000;
		break;
	case 460800:
		*res = 460800;
		break;
	case 500000:
		*res = 500000;
		break;
	case 576000:
		*res = 576000;
		break;
	case 921600:
		*res = 921600;
		break;
	case 1000000:
		*res = 1000000;
		break;
	case 1152000:
		*res = 1152000;
		break;
	case 1500000:
		*res = 1500000;
		break;
	case 2000000:
		*res = 2000000;
		break;
	case 2500000:
		*res = 2500000;
		break;
	case 3000000:
		*res = 3000000;
		break;
	case 3500000:
		*res = 3500000;
		break;
	case 4000000:
		*res = 4000000;
		break;
	default:
		*ok = 0;
	}
}

inline static COMPORTS0_FD CreateFile0 (const char *lpFileName)
{
	return (COMPORTS0_FD)CreateFile((LPCTSTR)lpFileName, GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, /* FILE_ATTRIBUTE_NORMAL */ 0, NULL);
}

inline static void CloseHandle0 (COMPORTS0_FD hObject)
{
	CloseHandle((HANDLE)hObject);
}

static void SetupPort (COMPORTS0_FD fd, COMPORTS0_BAUD baud, int parity, int *res)
{
	DCB dcb = {0}; dcb.DCBlength = sizeof(dcb);

	if (GetCommState((HANDLE)fd, &dcb) != 0) {
		dcb.BaudRate = (DWORD)baud;
		dcb.fBinary = 1; dcb.fAbortOnError = 1; dcb.ByteSize = 8; dcb.StopBits = ONESTOPBIT;
		switch (parity) {
		case COMPORTS0_PARITY_NONE:
			dcb.Parity = NOPARITY;
			break;
		case COMPORTS0_PARITY_ODD:
			dcb.Parity = ODDPARITY;
			break;
		case COMPORTS0_PARITY_EVEN:
			dcb.Parity = EVENPARITY;
			break;
		default:
			assert(0);
		}
		if (SetCommState((HANDLE)fd, &dcb) != 0) {
			COMMTIMEOUTS timeouts = {0};
			timeouts.ReadIntervalTimeout = MAXDWORD; /* "non-blocking" read */
			if (SetCommTimeouts((HANDLE)fd, &timeouts) != 0) {
				if (SetupComm((HANDLE)fd, COMPORTS0_IN_QUEUE, COMPORTS0_OUT_QUEUE) != 0) {
					if (SetCommMask((HANDLE)fd, 0) != 0) {
						if (PurgeComm((HANDLE)fd, PURGE_RXABORT | PURGE_RXCLEAR | PURGE_TXABORT | PURGE_TXCLEAR) != 0) {
							EscapeCommFunction((HANDLE)fd, CLRRTS);
							EscapeCommFunction((HANDLE)fd, CLRDTR);
							*res = 0;
						} else {
							*res = 8;
						}
					} else {
						*res = 7;
					}
				} else {
					*res = 6;
				}
			} else {
				*res = 5;
			}
		} else {
			*res = 4;
		}
	} else {
		*res = 3;
	} 
}

void COMPORTS0_Open (const char *dev, COMPORTS0_BAUD baud, COMPORTS0_Parity parity, COMPORTS0_FD *fd, int *res)
{
	COMPORTS0_BAUD encodedBaud;
	int ok;

	assert((parity == COMPORTS0_PARITY_NONE) || (parity == COMPORTS0_PARITY_ODD) || (parity == COMPORTS0_PARITY_EVEN));

	EncodeBaud(baud, &encodedBaud, &ok);
	if (ok) {
		*fd = CreateFile0(dev);
		if (((HANDLE)(*fd)) != INVALID_HANDLE_VALUE) {
			SetupPort(*fd, encodedBaud, parity, res);
			if (*res != 0) {
				CloseHandle0(*fd);
			}
		} else {
			*res = 2; /* CreateFile failed */
		}
	} else {
		*res = 1; /* unexpected baud */
	}
}

void COMPORTS0_Close (COMPORTS0_FD fd)
{
	CloseHandle0(fd);
}

void COMPORTS0_Write (COMPORTS0_FD fd, const void *adr, int len, int *wr, int *res)
{
	DWORD err;

	if (WriteFile((HANDLE)fd, (LPCVOID)adr, (DWORD)len, (LPDWORD)wr, NULL) != 0) {
		assert(*wr == len);
		*res = 0;
	} else {
		err = GetLastError();
		assert(err > 0);
		if (err == ERROR_OPERATION_ABORTED) {
			*res = -1;
		} else {
			*res = (int)err;
		}
	}
}

void COMPORTS0_Read (COMPORTS0_FD fd, void *adr, int len, int *rd, int *res)
{
	DWORD err;

	if (ReadFile((HANDLE)fd, (LPVOID)adr, (DWORD)len, (LPDWORD)rd, NULL) != 0) {
		*res = 0;
	} else {
		err = GetLastError();
		assert(err > 0);
		*res = err;
	}
}

#else

#include <sys/ioctl.h>
#include <fcntl.h>
#include <unistd.h>
#include <termios.h>
#include <errno.h>

inline static void close0 (COMPORTS0_FD fd)
{
	close((int)fd);
}

static void EncodeBaud (COMPORTS0_BAUD baud, COMPORTS0_BAUD *res, int *ok)
{
	*ok = 1;
	switch (baud) {
	case 50:
		*res = B50;
		break;
	case 75:
		*res = B75;
		break;
	case 110:
		*res = B110;
		break;
	case 134:
		*res = B134;
		break;
	case 150:
		*res = B150;
		break;
	case 200:
		*res = B200;
		break;
	case 300:
		*res = B300;
		break;
	case 600:
		*res = B600;
		break;
	case 1200:
		*res = B1200;
		break;
	case 1800:
		*res = B1800;
		break;
	case 2400:
		*res = B2400;
		break;
	case 4800:
		*res = B4800;
		break;
	case 9600:
		*res = B9600;
		break;
	case 19200:
		*res = B19200;
		break;
	case 38400:
		*res = B38400;
		break;
	case 57600:
		*res = B57600;
		break;
	case 115200:
		*res = B115200;
		break;
	case 230400:
		*res = B230400;
		break;
#ifdef B460800
	case 460800:
		*res = B460800;
		break;
#else
	case 460800:
		*res = 460800;
		break;
#endif
#ifdef B500000
	case 500000:
		*res = B500000;
		break;
#else
	case 500000:
		*res = 500000;
		break;
#endif
#ifdef B576000
	case 576000:
		*res = B576000;
		break;
#else
	case 576000:
		*res = 576000;
		break;
#endif
#ifdef B921600
	case 921600:
		*res = B921600;
		break;
#else
	case 921600:
		*res = 921600;
		break;
#endif
#ifdef B1000000
	case 1000000:
		*res = B1000000;
		break;
#else
	case 1000000:
		*res = 1000000;
		break;
#endif
#ifdef B1152000
	case 1152000:
		*res = B1152000;
		break;
#else
	case 1152000:
		*res = 1152000;
		break;
#endif
#ifdef B1500000
	case 1500000:
		*res = B1500000;
		break;
#else
	case 1500000:
		*res = 1500000;
		break;
#endif
#ifdef B2000000
	case 2000000:
		*res = B2000000;
		break;
#else
	case 2000000:
		*res = 2000000;
		break;
#endif
#ifdef B2500000
	case 2500000:
		*res = B2500000;
		break;
#else
	case 2500000:
		*res = 2500000;
		break;
#endif
#ifdef B3000000
	case 3000000:
		*res = B3000000;
		break;
#else
	case 3000000:
		*res = 3000000;
		break;
#endif
#ifdef B3500000
	case 3500000:
		*res = B3500000;
		break;
#else
	case 3500000:
		*res = 3500000;
		break;
#endif
#ifdef B4000000
	case 4000000:
		*res = B4000000;
		break;
#else
	case 4000000:
		*res = 4000000;
		break;
#endif
	default:
		*ok = 0;
	}
}

inline static COMPORTS0_FD open0 (const char *path)
{
	return (COMPORTS0_FD)open(path, O_RDWR | O_NONBLOCK);
}

static void SetupPort (COMPORTS0_FD d, COMPORTS0_BAUD baud, int parity, int *res)
{
	struct termios t;
	int modemBits;

	if (tcgetattr((int)d, &t) == 0) {
		t.c_iflag = IGNBRK | IGNPAR; t.c_oflag = 0; t.c_cflag = CS8 | CREAD | CLOCAL; t.c_lflag = 0; t.c_cc[VMIN] = 1; t.c_cc[VTIME] = 0;
		if (parity == COMPORTS0_PARITY_ODD) {
			t.c_cflag |= PARENB | PARODD;
		} else if (parity == COMPORTS0_PARITY_EVEN) {
			t.c_cflag |= PARENB;
		}
		if (cfsetspeed(&t, (speed_t)baud) != -1) {
			if (tcsetattr((int)d, TCSANOW, &t) == 0) {
				if (ioctl((int)d, TIOCMGET, &modemBits) != -1) {
					modemBits &= ~TIOCM_RTS;
					if (ioctl((int)d, TIOCMSET, &modemBits) != -1) {
						modemBits &= ~TIOCM_DTR;
						if (ioctl((int)d, TIOCMSET, &modemBits) != -1) {
							*res = 0;
						} else {
							*res = 8;
						}
					} else {
						*res = 7;
					}
				} else {
					*res = 0;
				}
				if (*res == 0) {
					if (tcflush((int)d, TCIFLUSH) != 0) {
						*res = 6;
					}
				}
			} else {
				*res = 5;
			}
		} else {
			*res = 4;
		}
	} else {
		*res = 3;
	}
}

void COMPORTS0_Open (const char *dev, COMPORTS0_BAUD baud, COMPORTS0_Parity parity, COMPORTS0_FD *fd, int *res)
{
	COMPORTS0_BAUD encodedBaud;
	int ok;

	assert((parity == COMPORTS0_PARITY_NONE) || (parity == COMPORTS0_PARITY_ODD) || (parity == COMPORTS0_PARITY_EVEN));

	EncodeBaud(baud, &encodedBaud, &ok);
	if (ok) {
		*fd = open0(dev);
		if (*fd != -1) {
			SetupPort(*fd, encodedBaud, parity, res);
			if (*res != 0) {
				close0(*fd);
			}
		} else {
			*res = 2; /* open failed */
		}
	} else {
		*res = 1; /* unexpected baud */
	}
}

void COMPORTS0_Close (COMPORTS0_FD fd)
{
	close0(fd);
}

void COMPORTS0_Write (COMPORTS0_FD fd, const void *adr, int len, int *wr, int *res)
{
	*wr = (int)write((int)fd, adr, (size_t)len);
	if (*wr == -1) {
		*wr = 0;
		*res = errno;
		if (*res == EAGAIN) {
			*res = 0;
		} else if (*res == 0) {
			*res = -1;
		}
	} else {
		*res = 0;
	}
}

void COMPORTS0_Read (COMPORTS0_FD fd, void *adr, int len, int *rd, int *res)
{
	*rd = (int)read((int)fd, adr, (size_t)len);
	if (*rd == -1) {
		*rd = 0;
		*res = errno;
		if (*res == EAGAIN) {
			*res = 0;
		} else if (*res == 0) {
			*res = -1;
		}
	} else {
		*res = 0;
	}
}

#endif
