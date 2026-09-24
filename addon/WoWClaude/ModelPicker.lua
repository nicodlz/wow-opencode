-- Model and reasoning variants are fetched from the connected OpenCode server.
-- Only the chosen ID/variant are stored per chat; the catalog is never saved.
local OC = WoWOpenCode
local picker
local PAGE_SIZE = 10

local function Safe(text) return (tostring(text or ""):gsub("|", "¦")) end

local function Button(parent, label, width, click)
	local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
	b:SetSize(width, 23)
	b:SetText(label)
	b:SetScript("OnClick", click)
	return b
end

local function Render()
	local b = picker
	local data = b.data or {}
	local stage = b.stage
	b.title:SetText(stage == "providers" and "Choose an OpenCode provider" or stage == "models" and ("Models — " .. Safe(data.name or b.provider or "")) or ("Thinking — " .. Safe(data.name or b.model or "")))
	local model, variant = OC.CurrentModel(b.chatId)
	b.current:SetText("Current: " .. (model ~= "" and Safe(model) or "OpenCode default") .. (variant ~= "" and " · " .. Safe(variant) or " · default reasoning"))
	b.status:SetText(b.loading and "Loading models from OpenCode…" or b.error or (#(data.items or {}) == 0 and "No connected models found." or stage == "models" and ("Page " .. (data.page or 1) .. "/" .. (data.pages or 1)) or "Select an option"))
	for i, row in ipairs(b.rows) do
		local item = data.items and data.items[(b.page - 1) * PAGE_SIZE + i]
		row:SetShown(item ~= nil and not b.loading and not b.error)
		if item then
			local label = item.name
			if stage == "models" and item.reasoning then label = label .. " · thinking options" end
			row:SetText(Safe(label))
			row.item = item
		end
	end
	b.back:SetShown(stage ~= "providers")
	b.prev:SetShown(stage == "models" and not b.loading and (data.page or 1) > 1 or stage == "variants" and b.page > 1)
	b.next:SetShown(stage == "models" and not b.loading and (data.page or 1) < (data.pages or 1) or stage == "variants" and b.page * PAGE_SIZE < #(data.items or {}))
end

local function Request(stage, text)
	picker.stage = stage
	picker.loading, picker.error, picker.data, picker.page = true, nil, nil, 1
	picker.request = OC.Control(stage, text, OC.Chat(picker.chatId))
	Render()
end

local function Build()
	local b = CreateFrame("Frame", "WoWOpenCodeModelPicker", UIParent, "BackdropTemplate")
	picker = b
	b:SetSize(590, 460)
	b:SetPoint("CENTER")
	b:SetFrameStrata("DIALOG")
	b:SetClampedToScreen(true)
	b:SetMovable(true)
	b:EnableMouse(true)
	b:RegisterForDrag("LeftButton")
	b:SetScript("OnDragStart", b.StartMoving)
	b:SetScript("OnDragStop", b.StopMovingOrSizing)
	b:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
	b:SetBackdropColor(0.04, 0.05, 0.07, 0.98)
	tinsert(UISpecialFrames, "WoWOpenCodeModelPicker")
	local close = CreateFrame("Button", nil, b, "UIPanelCloseButton")
	close:SetPoint("TOPRIGHT", b, "TOPRIGHT", -4, -4)
	b.title = b:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
	b.title:SetPoint("TOPLEFT", b, "TOPLEFT", 18, -18)
	b.current = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
	b.current:SetPoint("TOPLEFT", b, "TOPLEFT", 18, -52)
	b.current:SetWidth(550)
	b.current:SetJustifyH("LEFT")
	b.rows = {}
	for i = 1, PAGE_SIZE do
		local row = Button(b, "", 552, function(self)
			if b.stage == "providers" then
				b.provider = self.item.value
				Request("models", b.provider .. "\n1")
			elseif b.stage == "models" then
				b.model, b.modelName = self.item.value, self.item.name
				OC.SelectModel(b.model, "", b.modelName, b.chatId)
				Request("variants", b.model)
			else
				OC.SelectModel(b.model, self.item.value, b.modelName, b.chatId)
				b:Hide()
			end
		end)
		row:SetPoint("TOPLEFT", b, "TOPLEFT", 18, -98 - (i - 1) * 26)
		row:SetScript("OnEnter", function(self)
			GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
			GameTooltip:SetText(Safe(self.item.name))
			GameTooltip:AddLine(Safe(self.item.value), 0.7, 0.7, 0.7, true)
			GameTooltip:Show()
		end)
		row:SetScript("OnLeave", function() GameTooltip:Hide() end)
		b.rows[i] = row
	end
	b.back = Button(b, "Back", 80, function()
		if b.stage == "variants" then Request("models", b.provider .. "\n1")
		else Request("providers", "") end
	end)
	b.back:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 18, 46)
	b.prev = Button(b, "Previous", 92, function()
		if b.stage == "models" then Request("models", b.provider .. "\n" .. ((b.data.page or 1) - 1))
		else b.page = b.page - 1; Render() end
	end)
	b.prev:SetPoint("LEFT", b.back, "RIGHT", 6, 0)
	b.next = Button(b, "Next", 75, function()
		if b.stage == "models" then Request("models", b.provider .. "\n" .. ((b.data.page or 1) + 1))
		else b.page = b.page + 1; Render() end
	end)
	b.next:SetPoint("LEFT", b.prev, "RIGHT", 6, 0)
	local default = Button(b, "Use OpenCode default", 190, function()
		OC.SelectModel("", "", nil, b.chatId)
		b:Hide()
	end)
	default:SetPoint("BOTTOMRIGHT", b, "BOTTOMRIGHT", -18, 46)
	b.status = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
	b.status:SetPoint("BOTTOMLEFT", b, "BOTTOMLEFT", 18, 18)
	b.status:SetWidth(550)
	b.status:SetJustifyH("LEFT")
end

function OC.ChooseModel(mode)
	if not picker then Build() end
	local b = picker
	b.chatId = OC.ActiveChatId()
	local model = OC.CurrentModel(b.chatId)
	if mode == "reasoning" and model ~= "" then
		b.model, b.modelName, b.provider = model, nil, model:match("^([^/]+)/")
		Request("variants", model)
	else
		Request("providers", "")
	end
	b:Show()
end

function OC.ModelResult(result)
	local b = picker
	if not b or not b:IsShown() or result.id ~= b.request or result.chat ~= b.chatId then return end
	b.loading, b.error = false, result.error
	if not result.error then
		b.data = result
		if result.model then b.model = result.model; b.modelName = result.name end
	end
	Render()
end
