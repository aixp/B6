/*
	Alexander Shiryaev, 2021.05
*/

[CCode (cprefix = "COMPORTS0_", cheader_filename = "COMPorts0.h")]
namespace COMPorts0 {
	[CCode (cprefix = "COMPORTS0_", cheader_filename = "COMPorts0.h", default_value = "-1")]
	[IntegerType (rank = 10)]
	public struct FD {
	}

	[CCode (cheader_filename = "COMPorts0.h", cname = "COMPORTS0_BAUD", default_value = "0")]
	[IntegerType (rank = 6)]
	public struct Baud {
	}

	[CCode (cprefix = "COMPORTS0_PARITY_", cheader_filename = "COMPorts0.h")]
	public enum Parity {
		NONE,
		ODD,
		EVEN
	}

	[CCode (cheader_filename = "COMPorts0.h", cname = "COMPORTS0_Open")]
	public void open (char *dev, Baud baud, Parity parity, out FD fd, out int res);

	[CCode (cheader_filename = "COMPorts0.h", cname = "COMPORTS0_Close")]
	public void close (FD fd);

	[CCode (cheader_filename = "COMPorts0.h", cname = "COMPORTS0_Write")]
	public void write (FD fd, void *buf, int len, out int wr, out int res);

	[CCode (cheader_filename = "COMPorts0.h", cname = "COMPORTS0_Read")]
	public void read (FD fd, void *buf, int len, out int rd, out int res);
}
