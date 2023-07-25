import { Label } from "@atlaskit/form";
import Select from "@atlaskit/select";
import styled from "@emotion/styled";
import { token } from "@atlaskit/tokens";
import React from "react";

export type LabelType = {
	label: string;
	value: string;
};

const SelectDropdownContainer = styled.div`
	margin: ${token("space.150")} 0;
	position: relative;
`;
const IconContainer = styled.span`
	position: absolute;
	z-index: 2;
	top: 30px;
	left: 8px;
`;
const SelectContainer = styled.div`
	.react-select__value-container {
		padding-left: ${token("space.400")};
	}
`;

const SelectDropdown = ({
	options,
	label,
	onChange,
	placeholder = "",
	isLoading = false,
	icon,
}: {
	options: Array<LabelType>,
	label: string,
	onChange: (args: LabelType | null) => void,
	placeholder?: string,
	isLoading: boolean,
	icon?: React.JSX.Element
}) => {
	return (<>
		<SelectDropdownContainer>
			<IconContainer>
				{icon}
			</IconContainer>
			<Label htmlFor="select-org">{label}</Label>
			<SelectContainer>
				<Select
					inputId="select-org"
					className="single-select"
					isLoading={isLoading}
					classNamePrefix="react-select"
					onChange={onChange}
					options={options}
					placeholder={placeholder}
				/>
			</SelectContainer>
		</SelectDropdownContainer>
	</>);
};

export default SelectDropdown;
