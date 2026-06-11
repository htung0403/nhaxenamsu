import ErrorState from '../../components/shared/ErrorState';
import LoadingSkeleton from '../../components/shared/LoadingSkeleton';
import PageHeader from '../../components/shared/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useCustomerByUserId } from '../../hooks/queries/useCustomers';
import GroceryReceiverOrdersPage from './GroceryReceiverOrdersPage';
import GrocerySenderOrdersPage from './GrocerySenderOrdersPage';
import MyOrdersPage from './MyOrdersPage';
import VegetableReceiverOrdersPage from './VegetableReceiverOrdersPage';
import VegetableSenderOrdersPage from './VegetableSenderOrdersPage';

const MyOrdersByCustomerTypePage = () => {
  const { user } = useAuth();
  const { data: customer, isLoading, isError, refetch } = useCustomerByUserId(user?.id || '');

  if (isLoading) {
    return (
      <div className="w-full flex-1">
        <PageHeader title="Đơn hàng của tôi" description="Đang tải thông tin tài khoản khách hàng" />
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Không tải được thông tin tài khoản khách hàng" onRetry={() => refetch()} />;
  }

  switch (customer?.customer_type) {
    case 'grocery_receiver':
      return <GroceryReceiverOrdersPage />;
    case 'grocery_sender':
      return <GrocerySenderOrdersPage />;
    case 'vegetable_receiver':
      return <VegetableReceiverOrdersPage />;
    case 'vegetable_sender':
      return <VegetableSenderOrdersPage />;
    default:
      return <MyOrdersPage />;
  }
};

export default MyOrdersByCustomerTypePage;
