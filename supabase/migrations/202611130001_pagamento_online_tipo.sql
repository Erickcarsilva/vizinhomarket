-- VizinhoMarket — novo meio de pagamento: cartão pago online (pelo gateway).
-- Fica num arquivo próprio porque "alter type ... add value" não pode ser usado na mesma transação em que é criado.
-- Pix online usa o valor 'pix' já existente com orders.payment_mode = 'online'.
alter type public.payment_method add value if not exists 'card_online';
